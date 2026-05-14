// MCP client over stdio for the Microsoft WorkIQ MCP server.
// We spawn `npx -y @microsoft/workiq mcp` as a subprocess (or whatever
// `WORKIQ_COMMAND`/`WORKIQ_ARGS` says) and pipe JSON-RPC over stdin/stdout.
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { config } from "./config.js";

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

class WorkIqClient {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buf = "";
  private pending = new Map<number, (resp: JsonRpcResponse) => void>();
  private nextId = 1;
  private ready: Promise<void> | null = null;
  private tools: McpTool[] = [];
  private failedAt: number | null = null;

  private start(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      console.log(`[workiq] spawn ${config.workiqCommand} ${config.workiqArgs.join(" ")}`);
      const proc = spawn(config.workiqCommand, config.workiqArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, WORKIQ_ACCEPT_EULA: "true" },
      });
      this.proc = proc;
      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk: string) => this.onStdout(chunk));
      proc.stderr.setEncoding("utf8");
      proc.stderr.on("data", (chunk: string) => console.warn("[workiq stderr]", chunk.trim()));
      proc.on("exit", (code) => {
        console.warn(`[workiq] subprocess exited code=${code}`);
        this.proc = null;
        this.ready = null;
        this.failedAt = Date.now();
        for (const cb of this.pending.values()) cb({ jsonrpc: "2.0", id: -1, error: { code: -32603, message: "workiq subprocess exited" } });
        this.pending.clear();
      });

      // Initialize
      await this.call("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "NebulaGPT", version: "1.0.0" },
      });
      this.send("notifications/initialized", {}, null);
      const list = (await this.call("tools/list", {})) as { tools?: McpTool[] };
      this.tools = list.tools ?? [];
      console.log(`[workiq] ready — ${this.tools.length} tools`);
    })();
    return this.ready;
  }

  private onStdout(chunk: string): void {
    this.buf += chunk;
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        const cb = this.pending.get(msg.id);
        if (cb) {
          this.pending.delete(msg.id);
          cb(msg);
        }
      } catch (e) {
        console.warn("[workiq] bad JSON line:", line);
      }
    }
  }

  private send(method: string, params: unknown, id: number | null): void {
    if (!this.proc) return;
    const payload: Record<string, unknown> = { jsonrpc: "2.0", method, params };
    if (id !== null) payload.id = id;
    this.proc.stdin.write(JSON.stringify(payload) + "\n");
  }

  private call(method: string, params: unknown, timeoutMs = 30_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`workiq.${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, (resp) => {
        clearTimeout(timer);
        if (resp.error) reject(new Error(resp.error.message));
        else resolve(resp.result);
      });
      this.send(method, params, id);
    });
  }

  async listTools(): Promise<McpTool[]> {
    if (!config.workiqEnabled) return [];
    if (this.failedAt && Date.now() - this.failedAt < 60_000) return [];
    try {
      await this.start();
      return this.tools;
    } catch (e) {
      console.warn("[workiq] listTools failed:", (e as Error).message);
      return [];
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!config.workiqEnabled) return "[WorkIQ disabled]";
    try {
      await this.start();
      const result = (await this.call("tools/call", { name, arguments: args }, 60_000)) as {
        content?: Array<{ type: string; text?: string }>;
        isError?: boolean;
      };
      const text = result.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n") ?? "";
      return result.isError ? `[error] ${text}` : text;
    } catch (e) {
      return `[WorkIQ error] ${(e as Error).message}`;
    }
  }
}

export const workiq = new WorkIqClient();
