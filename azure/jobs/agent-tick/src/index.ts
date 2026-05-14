// Cron tick: ask each new agent to do an autonomous activity.
// Runs as a Container Apps Job with a schedule trigger; exits when done.

const AGENTS: { id: string; envVar: string }[] = [
  { id: "scribe",    envVar: "MCP_SCRIBE_URL" },
  { id: "herald",    envVar: "MCP_HERALD_URL" },
  { id: "sentinel",  envVar: "MCP_SENTINEL_URL" },
  { id: "auditor",   envVar: "MCP_AUDITOR_URL" },
  { id: "whisperer", envVar: "MCP_WHISPERER_URL" },
];

interface RpcResp {
  result?: { content?: Array<{ type: string; text: string }>; isError?: boolean };
  error?: { message: string };
}

async function tick(agent: { id: string; envVar: string }): Promise<void> {
  const url = process.env[agent.envVar];
  if (!url) { console.warn(`[tick] no URL for ${agent.id}, skipping`); return; }
  const payload = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: { name: "autonomous_tick", arguments: {} },
  };
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await r.json()) as RpcResp;
    if (json.error) console.error(`[tick] ${agent.id} error:`, json.error.message);
    else console.log(`[tick] ${agent.id} ok:`, (json.result?.content?.[0]?.text ?? "").slice(0, 200));
  } catch (err) {
    console.error(`[tick] ${agent.id} exception:`, (err as Error).message);
  }
}

async function main(): Promise<void> {
  console.log(`[tick] starting at ${new Date().toISOString()}`);
  await Promise.all(AGENTS.map(tick));
  console.log(`[tick] done at ${new Date().toISOString()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
