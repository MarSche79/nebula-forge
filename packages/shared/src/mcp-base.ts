import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import express, { Request, Response } from "express";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { AgentConfig } from "./types.js";

export function createMcpServer(config: AgentConfig): McpServer {
  return new McpServer({
    name: config.name,
    version: config.version,
  });
}

interface RegisteredTool {
  enabled?: boolean;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  // SDK 1.29+ stores the user-provided callback as `handler`. Older versions
  // exposed it as `callback`. We support both for forward/backward compatibility.
  handler?: (args: unknown, extra?: unknown) => Promise<unknown>;
  callback?: (args: unknown, extra?: unknown) => Promise<unknown>;
}

function getRegisteredTools(server: McpServer): Record<string, RegisteredTool> {
  // SDK 1.29+ exposes this internal map
  return ((server as unknown) as { _registeredTools: Record<string, RegisteredTool> })
    ._registeredTools ?? {};
}

function buildToolList(server: McpServer, configName: string, configVersion: string) {
  const tools = getRegisteredTools(server);
  return Object.entries(tools)
    .filter(([, tool]) => tool.enabled !== false)
    .map(([name, tool]) => {
      let inputSchema: unknown = { type: "object", properties: {} };
      try {
        if (tool.inputSchema) {
          // The SDK stores zod object shapes (record of zod fields) for raw shape,
          // or a full zod schema. Try both.
          const candidate: any = tool.inputSchema;
          if (candidate?._def?.typeName) {
            // Full zod schema
            inputSchema = zodToJsonSchema(candidate);
          } else if (typeof candidate === "object") {
            // Raw shape — wrap in z.object
            const z = require("zod");
            inputSchema = zodToJsonSchema(z.object(candidate));
          }
        }
      } catch {
        inputSchema = { type: "object", properties: {} };
      }
      return {
        name,
        title: tool.title ?? name,
        description: tool.description ?? "",
        inputSchema,
      };
    });
}

export async function startServer(server: McpServer, config: AgentConfig): Promise<void> {
  const app = express();
  app.use(express.json());

  // Health endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "healthy",
      agent: config.name,
      description: config.description,
      port: config.port,
      timestamp: new Date().toISOString(),
    });
  });

  // List tools as plain JSON (debugging helper)
  app.get("/tools", (_req: Request, res: Response) => {
    res.json({
      agent: config.name,
      tools: buildToolList(server, config.name, config.version),
    });
  });

  // Hand-rolled JSON-RPC handler (replaces the SDK transport)
  app.post("/mcp", async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const id = body.id;
    const method = body.method as string | undefined;
    const params = body.params ?? {};

    // Notifications (no id) — accept and return 202
    if (id === undefined && typeof method === "string") {
      res.status(202).end();
      return;
    }

    function ok(result: unknown) {
      res.json({ jsonrpc: "2.0", id, result });
    }
    function err(code: number, message: string) {
      res.json({ jsonrpc: "2.0", id, error: { code, message } });
    }

    try {
      if (method === "initialize") {
        ok({
          protocolVersion: "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: config.name, version: config.version },
        });
        return;
      }

      if (method === "ping") {
        ok({});
        return;
      }

      if (method === "tools/list") {
        ok({ tools: buildToolList(server, config.name, config.version) });
        return;
      }

      if (method === "tools/call") {
        const toolName = params.name as string;
        const args = params.arguments ?? {};
        const tools = getRegisteredTools(server);
        const tool = tools[toolName];
        if (!tool) {
          err(-32601, `Tool not found: ${toolName}`);
          return;
        }
        if (tool.enabled === false) {
          err(-32601, `Tool disabled: ${toolName}`);
          return;
        }
        const fn = tool.handler ?? tool.callback;
        if (typeof fn !== "function") {
          err(-32603, `Tool ${toolName} has no callable handler`);
          return;
        }
        try {
          const result = await fn(args);
          ok(result);
        } catch (e) {
          err(-32603, `Tool execution failed: ${(e as Error).message}`);
        }
        return;
      }

      err(-32601, `Method not found: ${method ?? "(none)"}`);
    } catch (e) {
      console.error("[mcp] handler error:", e);
      if (!res.headersSent) {
        err(-32603, `Internal error: ${(e as Error).message}`);
      }
    }
  });

  // Disallow GET/DELETE explicitly
  app.get("/mcp", (_req, res) => res.status(405).json({ error: "Use POST" }));
  app.delete("/mcp", (_req, res) => res.status(405).json({ error: "Use POST" }));

  const port = parseInt(process.env.PORT || String(config.port), 10);
  app.listen(port, () => {
    console.log(`\n${config.name} MCP Server`);
    console.log(`   ${config.description}`);
    console.log(`   Listening on http://localhost:${port}/mcp`);
    console.log(`   Health: http://localhost:${port}/health`);
    const tcount = Object.keys(getRegisteredTools(server)).length;
    console.log(`   Tools registered: ${tcount}\n`);
  });
}
