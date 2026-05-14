import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { getOpenAI } from "./openai-client.js";
import { workiq } from "./workiq.js";
import { config } from "./config.js";

export const SYSTEM_PROMPT = `You are **NebulaGPT** — the internal AI assistant for **Threat Ninja**.

You have these capabilities:
- Reason over the user's **Microsoft 365** content (emails, meetings, SharePoint documents, Teams messages, people) via the Microsoft WorkIQ tools.
- Draft documents (briefings, reports, summaries) in Markdown that the user can save back to SharePoint.
- Cite your sources. Whenever you used a WorkIQ tool result, mention it briefly and inline ("according to your March budget deck, ...").

Rules:
1. **Always check WorkIQ first** for any factual question about company content or people. Never fabricate a meeting, person, document, or message.
2. If WorkIQ returns nothing useful, say so plainly — don't invent.
3. Format long answers as concise Markdown with bold key points, lists, and headings.
4. When the user asks you to draft a document, output it in proper Markdown so the "Save to SharePoint" button can convert it.
5. Tone: precise, professional, slightly informal. No emoji unless the user uses them first.`;

export interface StreamEvents {
  onText: (delta: string) => void;
  onToolCall: (name: string, args: unknown) => void;
  onToolResult: (name: string, text: string) => void;
  onDone: (final: { fullText: string }) => void;
}

export async function runChat(
  history: ChatCompletionMessageParam[],
  userMessage: string,
  events: StreamEvents,
): Promise<void> {
  const tools = await buildTools();
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userMessage },
  ];

  const openai = getOpenAI();
  const MAX_ROUNDS = 5;
  let aggregated = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = await openai.chat.completions.create({
      model: config.openaiDeployment,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
      temperature: 0.3,
      stream: true,
    });

    let toolCalls: Array<{ id: string; name: string; args: string }> = [];
    let partialContent = "";

    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta;
      if (delta?.content) {
        partialContent += delta.content;
        events.onText(delta.content);
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCalls[idx]) toolCalls[idx] = { id: tc.id ?? "", name: "", args: "" };
          if (tc.id) toolCalls[idx].id = tc.id;
          if (tc.function?.name) toolCalls[idx].name += tc.function.name;
          if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments;
        }
      }
    }

    aggregated += partialContent;

    if (toolCalls.length === 0) {
      events.onDone({ fullText: aggregated });
      return;
    }

    // Append assistant turn with tool_calls to history
    messages.push({
      role: "assistant",
      content: partialContent || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.args || "{}" },
      })),
    });

    for (const tc of toolCalls) {
      let parsedArgs: Record<string, unknown> = {};
      try { parsedArgs = JSON.parse(tc.args || "{}"); } catch { /* ignore */ }
      events.onToolCall(tc.name, parsedArgs);
      const result = await workiq.callTool(tc.name, parsedArgs);
      events.onToolResult(tc.name, result);
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  events.onDone({ fullText: aggregated || "(Max tool rounds reached.)" });
}

async function buildTools(): Promise<ChatCompletionTool[]> {
  const list = await workiq.listTools();
  return list.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: (t.inputSchema as Record<string, unknown> | undefined) ?? { type: "object", properties: {} },
    },
  }));
}
