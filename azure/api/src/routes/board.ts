import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/jwt.js";
import { config } from "../config.js";
import {
  listAgents, listTasks, getTask, createTask, patchTask, deleteTask,
  listActivity, insertActivity,
} from "../db/board.js";
import { dispatchTaskToAgent } from "../board/dispatch.js";
import { isPostgresConfigured } from "../db/postgres.js";

export const boardRouter = Router();

function ensurePg(res: import("express").Response): boolean {
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "Postgres not configured" });
    return false;
  }
  return true;
}

// ---------- Agents (read-only catalogue) ----------
boardRouter.get("/agents", requireAuth, async (_req, res) => {
  if (!ensurePg(res)) return;
  res.json(await listAgents());
});

// ---------- Tasks ----------
boardRouter.get("/tasks", requireAuth, async (req, res) => {
  if (!ensurePg(res)) return;
  const status = (req.query.status as string | undefined) as
    | "backlog" | "in_progress" | "blocked" | "done" | undefined;
  const agentId = (req.query.agentId as string | undefined) ?? undefined;
  res.json(await listTasks({ status, agentId }));
});

const NewTaskBody = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(4000).optional(),
  agentId: z.string().optional().nullable(),
  priority: z.number().int().min(1).max(5).optional(),
  dueAt: z.string().datetime().optional().nullable(),
});

boardRouter.post("/tasks", requireAuth, async (req, res) => {
  if (!ensurePg(res)) return;
  const parsed = NewTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", detail: parsed.error.flatten() });
    return;
  }
  const principalName = req.headers["x-ms-client-principal-name"];
  const createdBy = Array.isArray(principalName) ? principalName[0]! : (principalName as string | undefined) ?? null;
  const task = await createTask({ ...parsed.data, source: "user", createdBy });
  res.status(201).json(task);
});

const PatchBody = z.object({
  status: z.enum(["backlog", "in_progress", "blocked", "done"]).optional(),
  agentId: z.string().nullable().optional(),
  priority: z.number().int().min(1).max(5).optional(),
});

boardRouter.patch("/tasks/:id", requireAuth, async (req, res) => {
  if (!ensurePg(res)) return;
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const id = String(req.params.id ?? "");
  const updated = await patchTask(id, parsed.data);
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

boardRouter.delete("/tasks/:id", requireAuth, async (req, res) => {
  if (!ensurePg(res)) return;
  const id = String(req.params.id ?? "");
  const ok = await deleteTask(id);
  res.json({ ok });
});

boardRouter.post("/tasks/:id/dispatch", requireAuth, async (req, res) => {
  if (!ensurePg(res)) return;
  const id = String(req.params.id ?? "");
  const task = await getTask(id);
  if (!task) { res.status(404).json({ error: "Not found" }); return; }
  if (!task.agentId) { res.status(400).json({ error: "Task has no agentId assigned" }); return; }

  await patchTask(id, { status: "in_progress" });
  const tool = (req.body?.tool as string | undefined) ?? "autonomous_tick";
  const args = (req.body?.args as Record<string, unknown> | undefined) ?? {
    title: task.title, body: task.body ?? undefined,
  };

  const result = await dispatchTaskToAgent({ agentId: task.agentId, tool, args, taskId: id });
  await patchTask(id, { status: result.ok ? "done" : "blocked", lastResult: result });
  await insertActivity({
    taskId: id, agentId: task.agentId, surface: "system",
    action: result.ok ? "task_dispatched_ok" : "task_dispatched_failed",
    detail: { tool, args, output: result.output.slice(0, 500) },
  });
  res.json(result);
});

// ---------- Activity feed ----------
boardRouter.get("/activity", requireAuth, async (req, res) => {
  if (!ensurePg(res)) return;
  const agentId = (req.query.agentId as string | undefined) ?? undefined;
  const taskId = (req.query.taskId as string | undefined) ?? undefined;
  const limit = req.query.limit ? Math.min(parseInt(String(req.query.limit), 10) || 100, 500) : 100;
  res.json(await listActivity({ agentId, taskId, limit }));
});

// Internal callback used by agents — auth via shared callback secret, NOT user JWT.
boardRouter.post("/activity", async (req, res) => {
  if (!ensurePg(res)) return;
  const got = String(req.headers["x-agent-callback-secret"] ?? "");
  const expected = config.agentCallbackSecret;
  if (!expected || got !== expected) { res.status(401).json({ error: "bad-callback-secret" }); return; }

  const Body = z.object({
    taskId: z.string().nullable().optional(),
    agentId: z.string(),
    surface: z.enum(["sharepoint", "teams", "purview", "defender", "system"]),
    action: z.string().min(1).max(80),
    detail: z.record(z.unknown()).optional(),
    externalUrl: z.string().url().optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", detail: parsed.error.flatten() }); return; }

  const row = await insertActivity(parsed.data);
  res.status(201).json(row);
});
