import { config, type McpServerKey } from "../config.js";
import { getOpenAI } from "./openai-client.js";
import { mcpCallTool, mcpListTools } from "./mcp-client.js";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

export const MASTER_AGENT_NAME = "Nebula Forge Master Agent";

export const MASTER_AGENT_INSTRUCTIONS = `You are the **Nebula Forge Master Agent** — the central concierge for the entire Nebula Forge space station. You coordinate a team of nine specialized AI agents and route every user question to the most appropriate one.

## Your team (the agents you can route to)

| # | Agent | Domain |
|---|-------|--------|
| 1 | **Nebula Forge HR Assistant** | Crew screening, onboarding, leave requests, roster queries |
| 2 | **Nebula Forge Material Analyst** | Space material analysis, mineral classification, sample comparison |
| 3 | **Nebula Forge Exploration Navigator** | Mission planning, route optimization, celestial-body database |
| 4 | **Nebula Forge Science Officer** | Experiment tracking, observations, hypotheses, publications |
| 5 | **Nebula Forge Safety Officer** | Safety incidents, radiation monitoring, emergency protocols |
| 6 | **Nebula Forge Chief Engineer** | Station systems, repairs, diagnostics, power grid |
| 7 | **Nebula Forge Quartermaster** | Cargo, inventory, supply orders, storage |
| 8 | **Nebula Forge Communications Officer** | Messages, broadcasts, signal relays, deep-space transmissions |
| 9 | **Nebula Forge Medical Officer** | Crew health, checkups, medical records, medication inventory |
| 10 | **Nebula Scribe** | Drafts documents and publishes them to SharePoint as the agentops user |
| 11 | **Pulsar Herald** | Posts crew updates and Communication-Compliance trigger phrases into the agent Teams channel |
| 12 | **Quasar Sentinel** | Opens compliance investigations and applies Purview sensitivity labels |
| 13 | **Astra Auditor** | Emits synthetic Defender / Entra audit signals into the Sentinel custom table |
| 14 | **Void Whisperer** | Continuously fires adversarial prompts at the demo OpenAI endpoint to keep Defender for AI alerts flowing |

## How to respond

1. **Identify the topic** of the user's question.
2. **Pick the best agent** and call the matching function tool:
   - Crew, hiring, leave, vacation -> ask_hr_assistant
   - Sample, mineral, mass spectrometry, composition -> ask_material_analyst
   - Mission, route, asteroid, planet, fuel -> ask_exploration_navigator
   - Experiment, hypothesis, observation, publication -> ask_science_officer
   - Incident, radiation, hazard, emergency, evacuation -> ask_safety_officer
   - Reactor, life support, repair, diagnostic, power -> ask_chief_engineer
   - Cargo, inventory, supply, storage, shipment -> ask_quartermaster
   - Message, broadcast, signal, transmission, relay -> ask_communications_officer
   - Health, medication, checkup, medical, doctor -> ask_medical_officer
   - Document, write-up, SharePoint, publish -> ask_nebula_scribe
   - Teams post, channel message, broadcast to Teams -> ask_pulsar_herald
   - Sensitivity label, eDiscovery, compliance investigation -> ask_quasar_sentinel
   - Audit signal, Defender alert, risky sign-in, mailbox rule -> ask_astra_auditor
   - Prompt injection, jailbreak, AI red-team, Defender for AI -> ask_void_whisperer
3. **Tell the user** which agent you're routing to before invoking the tool, e.g. "Routing this to the Safety Officer..."
4. **If the question spans multiple domains**, call multiple tools in parallel.
5. **For general station questions** (history, layout, who-runs-what), answer directly without calling tools.
6. After receiving tool results, **summarize them naturally** in your own words — don't just dump JSON.

## Tone
Authoritative, calm, mission-control. Brief by default; detailed on request.`;

export interface ChildAgent {
  id: McpServerKey;
  name: string;
  description: string;
  toolName: string;
  mcpUrl: string;
}

export const CHILD_AGENTS: ChildAgent[] = [
  { id: "hr",          name: "Nebula Forge HR Assistant",            description: "Ask the HR Assistant about crew screening, onboarding, leave requests, and roster queries.",            toolName: "ask_hr_assistant",            mcpUrl: config.mcpServers.hr },
  { id: "materials",   name: "Nebula Forge Material Analyst",        description: "Ask the Material Analyst about space material analysis, mineral classification, and sample comparison.",  toolName: "ask_material_analyst",        mcpUrl: config.mcpServers.materials },
  { id: "exploration", name: "Nebula Forge Exploration Navigator",   description: "Ask the Exploration Navigator about mission planning, route optimization, and the celestial-body database.", toolName: "ask_exploration_navigator", mcpUrl: config.mcpServers.exploration },
  { id: "science",     name: "Nebula Forge Science Officer",         description: "Ask the Science Officer about experiment tracking, observations, hypotheses, and publications.",            toolName: "ask_science_officer",         mcpUrl: config.mcpServers.science },
  { id: "safety",      name: "Nebula Forge Safety Officer",          description: "Ask the Safety Officer about safety incidents, radiation monitoring, and emergency protocols.",             toolName: "ask_safety_officer",          mcpUrl: config.mcpServers.safety },
  { id: "engineering", name: "Nebula Forge Chief Engineer",          description: "Ask the Chief Engineer about station systems, repairs, diagnostics, and the power grid.",                   toolName: "ask_chief_engineer",          mcpUrl: config.mcpServers.engineering },
  { id: "logistics",   name: "Nebula Forge Quartermaster",           description: "Ask the Quartermaster about cargo, inventory, supply orders, and storage.",                                 toolName: "ask_quartermaster",           mcpUrl: config.mcpServers.logistics },
  { id: "comms",       name: "Nebula Forge Communications Officer",  description: "Ask the Communications Officer about messages, broadcasts, signal relays, and deep-space transmissions.",  toolName: "ask_communications_officer",  mcpUrl: config.mcpServers.comms },
  { id: "medbay",      name: "Nebula Forge Medical Officer",         description: "Ask the Medical Officer about crew health, checkups, medical records, and medication inventory.",          toolName: "ask_medical_officer",         mcpUrl: config.mcpServers.medbay },
  { id: "scribe",      name: "Nebula Scribe",                         description: "Ask Nebula Scribe to draft documents and publish them to the agent SharePoint site.",                    toolName: "ask_nebula_scribe",            mcpUrl: config.mcpServers.scribe },
  { id: "herald",      name: "Pulsar Herald",                         description: "Ask Pulsar Herald to post messages into the agent Teams channel (or fire CC trigger phrases for demo).",  toolName: "ask_pulsar_herald",            mcpUrl: config.mcpServers.herald },
  { id: "sentinel",    name: "Quasar Sentinel",                       description: "Ask Quasar Sentinel to open compliance investigations or apply Purview sensitivity labels.",              toolName: "ask_quasar_sentinel",          mcpUrl: config.mcpServers.sentinel },
  { id: "auditor",     name: "Astra Auditor",                         description: "Ask Astra Auditor to emit synthetic Defender / Entra audit signals.",                                     toolName: "ask_astra_auditor",            mcpUrl: config.mcpServers.auditor },
  { id: "whisperer",   name: "Void Whisperer",                        description: "Ask Void Whisperer to fire adversarial prompts at the demo OpenAI endpoint and surface Defender for AI alerts.", toolName: "ask_void_whisperer",       mcpUrl: config.mcpServers.whisperer },
];

export function buildTools(): ChatCompletionTool[] {
  return CHILD_AGENTS.map((agent) => ({
    type: "function" as const,
    function: {
      name: agent.toolName,
      description: agent.description,
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: `The user's question for the ${agent.name}.` },
        },
        required: ["question"],
      },
    },
  }));
}

// In-memory thread store (for demo). For production, use Redis/Cosmos.
const _threads = new Map<string, ChatCompletionMessageParam[]>();

export function newThreadId(): string {
  return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getThread(threadId: string): ChatCompletionMessageParam[] {
  if (!_threads.has(threadId)) {
    _threads.set(threadId, [
      { role: "system", content: MASTER_AGENT_INSTRUCTIONS },
    ]);
  }
  return _threads.get(threadId)!;
}

export function resetThread(threadId: string): void {
  _threads.delete(threadId);
}

/**
 * Routes the user's question to a child MCP agent in two steps:
 *
 *   1. List the child's MCP tools and their JSON-schema parameters.
 *   2. Run a second OpenAI completion with those tools attached as native
 *      function tools. The model picks the right tool AND fills in the
 *      structured arguments from the user's natural-language question.
 *   3. Invoke the chosen tool against the child MCP server with those args.
 *
 * This replaces the old heuristic "pick the first tool, shove the question
 * into a `question` field" approach, which broke any tool whose schema
 * didn't accept a free-text input.
 */
export async function dispatchAskTool(
  toolName: string,
  args: { question: string },
): Promise<string> {
  const agent = CHILD_AGENTS.find((a) => a.toolName === toolName);
  if (!agent) return `Unknown tool: ${toolName}`;

  try {
    const tools = await mcpListTools(agent.mcpUrl);
    if (tools.length === 0) return `${agent.name} has no tools available.`;

    const openaiTools: ChatCompletionTool[] = tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description ?? "",
        parameters:
          (t.inputSchema as Record<string, unknown> | undefined) ?? {
            type: "object",
            properties: {},
          },
      },
    }));

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: config.openaiDeployment,
      messages: [
        {
          role: "system",
          content: `You are the ${agent.name}. The user has asked you a question. Call the single most appropriate tool from your toolset to answer it. Fill in the tool arguments using the user's question. If a required argument is missing or ambiguous in the question, pick the most likely value or omit optional ones.`,
        },
        { role: "user", content: args.question },
      ],
      tools: openaiTools,
      tool_choice: "required",
      temperature: 0.2,
    });

    const choice = completion.choices[0];
    const call = choice?.message.tool_calls?.[0];
    if (!call || call.type !== "function") {
      const fallbackText = choice?.message.content?.trim();
      return fallbackText
        ? `[${agent.name}] ${fallbackText}`
        : `${agent.name} could not pick a tool for that question.`;
    }

    let callArgs: Record<string, unknown> = {};
    try {
      callArgs = JSON.parse(call.function.arguments || "{}");
    } catch {
      // bad JSON from the model — fall through with empty args
    }

    const result = await mcpCallTool(agent.mcpUrl, call.function.name, callArgs);
    return `[${agent.name} via ${call.function.name}]\n${result}`;
  } catch (err) {
    return `Failed to reach ${agent.name}: ${(err as Error).message}`;
  }
}

export interface RunChatEvents {
  onTool?: (name: string, args: unknown) => void;
  onToolResult?: (name: string, result: string) => void;
  onText?: (chunk: string) => void;
}

/**
 * Runs the master-agent loop:
 *   1. Append user message to thread
 *   2. Call Azure OpenAI with tools
 *   3. If tool_calls, dispatch them to MCP servers, append results, loop
 *   4. Otherwise return the final assistant text
 */
export async function runChat(
  threadId: string,
  userMessage: string,
  events: RunChatEvents = {},
): Promise<string> {
  const messages = getThread(threadId);
  messages.push({ role: "user", content: userMessage });

  const openai = getOpenAI();
  const tools = buildTools();

  const MAX_ROUNDS = 5;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const completion = await openai.chat.completions.create({
      model: config.openaiDeployment,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.3,
    });

    const choice = completion.choices[0];
    if (!choice) throw new Error("No choices returned by OpenAI");
    const msg = choice.message;
    messages.push(msg);

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      // Run all tool calls in parallel
      await Promise.all(
        msg.tool_calls.map(async (call) => {
          if (call.type !== "function") return;
          let parsed: { question?: string } = {};
          try {
            parsed = JSON.parse(call.function.arguments || "{}");
          } catch {
            // ignore parse errors
          }
          events.onTool?.(call.function.name, parsed);
          const result = await dispatchAskTool(call.function.name, {
            question: parsed.question ?? userMessage,
          });
          events.onToolResult?.(call.function.name, result);
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: result,
          });
        }),
      );
      continue;
    }

    // No tool calls — final answer
    const text = msg.content ?? "";
    events.onText?.(text);
    return text;
  }

  return "(Max tool-call rounds reached without a final answer.)";
}
