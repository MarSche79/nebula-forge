import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "./auth.js";
import {
  createSession, listSessions, getSession, deleteSession, renameSession,
  appendMessage, listMessages,
} from "./storage.js";
import { runChat } from "./chat-engine.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const sessionsRouter = Router();

sessionsRouter.get("/", requireAuth, async (req, res) => {
  res.json(await listSessions(req.user!.oid));
});

sessionsRouter.post("/", requireAuth, async (req, res) => {
  const body = z.object({ title: z.string().trim().min(1).max(200).optional() }).safeParse(req.body ?? {});
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const s = await createSession(req.user!.oid, body.data.title ?? "New chat");
  res.status(201).json(s);
});

sessionsRouter.get("/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const s = await getSession(id, req.user!.oid);
  if (!s) { res.status(404).json({ error: "Not found" }); return; }
  const messages = await listMessages(s.id);
  res.json({ session: s, messages });
});

sessionsRouter.patch("/:id", requireAuth, async (req, res) => {
  const body = z.object({ title: z.string().trim().min(1).max(200) }).safeParse(req.body ?? {});
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const id = String(req.params.id);
  const s = await getSession(id, req.user!.oid);
  if (!s) { res.status(404).json({ error: "Not found" }); return; }
  await renameSession(id, req.user!.oid, body.data.title);
  res.json({ ok: true });
});

sessionsRouter.delete("/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const ok = await deleteSession(id, req.user!.oid);
  res.json({ ok });
});

// ---- Chat (SSE streaming) ----
export const chatRouter = Router();

chatRouter.post("/:sessionId/message", requireAuth, async (req, res) => {
  const sessionId = String(req.params.sessionId);
  const session = await getSession(sessionId, req.user!.oid);
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  const body = z.object({ message: z.string().trim().min(1).max(8000) }).safeParse(req.body ?? {});
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }

  await appendMessage(sessionId, "user", body.data.message);

  res.setHeader("content-type", "text/event-stream");
  res.setHeader("cache-control", "no-cache, no-transform");
  res.setHeader("connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Build openai message history
  const prev = await listMessages(sessionId);
  const history: ChatCompletionMessageParam[] = prev
    .filter((m) => m.id !== prev[prev.length - 1]?.id) // exclude the user msg we just inserted (we add it via runChat)
    .map((m) => ({
      role: m.role === "tool" ? "assistant" : m.role,
      content: m.content,
    })) as ChatCompletionMessageParam[];

  let fullText = "";
  try {
    await runChat(history, body.data.message, {
      onText: (delta) => { fullText += delta; send("text", { delta }); },
      onToolCall: (name, args) => send("tool_call", { name, args }),
      onToolResult: (name, text) => send("tool_result", { name, preview: text.slice(0, 200) }),
      onDone: ({ fullText: ft }) => { fullText = ft || fullText; },
    });
    await appendMessage(sessionId, "assistant", fullText);
    send("done", { ok: true });
  } catch (err) {
    console.error("[chat] error:", err);
    send("error", { message: (err as Error).message });
  } finally {
    res.end();
  }

  // If session is still titled "New chat", auto-title from first user message
  if (session.title === "New chat") {
    const title = body.data.message.slice(0, 60).replace(/\s+/g, " ").trim();
    if (title.length > 0) await renameSession(sessionId, req.user!.oid, title);
  }
});
