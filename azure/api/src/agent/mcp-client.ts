interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id?: number | string;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface McpSession {
  sessionId?: string;
}

async function postMcp(
  serverUrl: string,
  body: unknown,
  session: McpSession,
): Promise<{ status: number; text: string; sessionId?: string; contentType: string }> {
  const url = serverUrl.replace(/\/$/, "") + "/mcp";
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (session.sessionId) headers["mcp-session-id"] = session.sessionId;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const sid = res.headers.get("mcp-session-id");
  if (sid) session.sessionId = sid;

  return {
    status: res.status,
    text: await res.text().catch(() => ""),
    sessionId: sid ?? session.sessionId,
    contentType: res.headers.get("content-type") || "",
  };
}

function parseRpcResponse<T>(text: string, contentType: string, method: string): T {
  if (!text) throw new Error(`MCP ${method}: empty response body`);
  let payload: string;
  if (contentType.includes("text/event-stream")) {
    const dataLine = text.split(/\r?\n/).find((l) => l.startsWith("data:"));
    if (!dataLine) throw new Error(`MCP ${method}: SSE response with no data line. Body: ${text.slice(0, 200)}`);
    payload = dataLine.slice(5).trim();
  } else {
    payload = text;
  }
  let parsed: JsonRpcResponse<T>;
  try {
    parsed = JSON.parse(payload) as JsonRpcResponse<T>;
  } catch {
    throw new Error(`MCP ${method}: failed to parse JSON: ${payload.slice(0, 300)}`);
  }
  if (parsed.error) {
    throw new Error(`MCP ${method} error ${parsed.error.code}: ${parsed.error.message}`);
  }
  return parsed.result as T;
}

async function rpc<T>(
  serverUrl: string,
  method: string,
  params: Record<string, unknown> | undefined,
  session: McpSession,
): Promise<T> {
  const body = {
    jsonrpc: "2.0" as const,
    id: Date.now() + Math.floor(Math.random() * 1000),
    method,
    ...(params ? { params } : {}),
  };
  const r = await postMcp(serverUrl, body, session);
  if (r.status < 200 || r.status >= 300) {
    throw new Error(
      `MCP ${method} HTTP ${r.status} from ${serverUrl}: ${r.text.slice(0, 300)}`,
    );
  }
  return parseRpcResponse<T>(r.text, r.contentType, method);
}

async function notify(
  serverUrl: string,
  method: string,
  params: Record<string, unknown> | undefined,
  session: McpSession,
): Promise<void> {
  // Notifications have no id and expect no response (202 Accepted)
  const body = {
    jsonrpc: "2.0" as const,
    method,
    ...(params ? { params } : {}),
  };
  const r = await postMcp(serverUrl, body, session);
  if (r.status >= 400) {
    throw new Error(
      `MCP notification ${method} HTTP ${r.status}: ${r.text.slice(0, 300)}`,
    );
  }
}

async function ensureSession(serverUrl: string, session: McpSession): Promise<void> {
  // Initialize handshake
  await rpc(
    serverUrl,
    "initialize",
    {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "nebula-forge-api", version: "1.0.0" },
    },
    session,
  );
  // MCP spec REQUIRES this notification before any other request
  await notify(serverUrl, "notifications/initialized", undefined, session);
}

export async function mcpListTools(serverUrl: string): Promise<McpTool[]> {
  const session: McpSession = {};
  try {
    await ensureSession(serverUrl, session);
    const result = await rpc<{ tools: McpTool[] }>(serverUrl, "tools/list", {}, session);
    return result.tools ?? [];
  } catch (err) {
    console.error(`[mcp-client] mcpListTools(${serverUrl}) failed:`, (err as Error).message);
    throw err;
  }
}

export async function mcpCallTool(
  serverUrl: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const session: McpSession = {};
  try {
    await ensureSession(serverUrl, session);
    const result = await rpc<{
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    }>(serverUrl, "tools/call", { name: toolName, arguments: args }, session);

    const text = (result.content ?? [])
      .map((c) => (c.type === "text" ? c.text ?? "" : ""))
      .join("\n")
      .trim();
    if (result.isError) {
      throw new Error(`MCP tool ${toolName} returned error: ${text}`);
    }
    return text;
  } catch (err) {
    console.error(`[mcp-client] mcpCallTool(${serverUrl}, ${toolName}) failed:`, (err as Error).message);
    throw err;
  }
}
