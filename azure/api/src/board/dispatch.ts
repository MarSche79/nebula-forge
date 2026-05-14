import { config } from "../config.js";

interface McpToolCallResult {
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export async function dispatchTaskToAgent(opts: {
  agentId: string; tool: string; args: Record<string, unknown>; taskId: string;
}): Promise<{ ok: boolean; output: string; raw?: unknown }> {
  const url = (config.mcpServers as Record<string, string>)[opts.agentId];
  if (!url) return { ok: false, output: `Unknown agent: ${opts.agentId}` };

  const payload = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: {
      name: opts.tool,
      arguments: { ...opts.args, taskId: opts.taskId },
    },
  };
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await r.json()) as { result?: McpToolCallResult; error?: { message: string } };
    if (json.error) return { ok: false, output: json.error.message, raw: json };
    const txt = json.result?.content?.map((c) => c.text).join("\n") ?? "";
    return { ok: !json.result?.isError, output: txt, raw: json.result };
  } catch (err) {
    return { ok: false, output: (err as Error).message };
  }
}
