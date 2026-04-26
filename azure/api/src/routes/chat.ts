import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/jwt.js";
import { newThreadId, resetThread, runChat } from "../agent/master-agent.js";

export const chatRouter = Router();

const ChatBody = z.object({
  message: z.string().min(1),
  threadId: z.string().optional(),
});

function sse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

chatRouter.post("/reset", requireAuth, (req, res) => {
  const tid = (req.body?.threadId as string | undefined) ?? "";
  if (tid) resetThread(tid);
  res.json({ threadId: newThreadId() });
});

chatRouter.post("/", requireAuth, async (req, res) => {
  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", detail: parsed.error.flatten() });
    return;
  }
  const { message } = parsed.data;
  let threadId = parsed.data.threadId ?? newThreadId();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  sse(res, "thread", { threadId });

  try {
    const text = await runChat(threadId, message, {
      onTool: (name, args) => sse(res, "tool", { name, args }),
      onToolResult: (name) => sse(res, "tool-result", { name }),
    });

    // Stream the final text in chunks
    const chunkSize = 64;
    for (let i = 0; i < text.length; i += chunkSize) {
      sse(res, "token", { text: text.slice(i, i + chunkSize) });
      await new Promise((r) => setTimeout(r, 10));
    }
    sse(res, "done", { threadId });
    res.end();
  } catch (err) {
    console.error("[chat] error:", err);
    sse(res, "error", { message: (err as Error).message });
    sse(res, "done", { threadId });
    res.end();
  }
});
