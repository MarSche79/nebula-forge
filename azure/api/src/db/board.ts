import { getPool } from "./postgres.js";

export type TaskStatus = "backlog" | "in_progress" | "blocked" | "done";
export type TaskSource = "user" | "cron" | "agent";

export interface AgentDef {
  id: string;
  display_name: string;
  description: string;
  mcp_url: string | null;
  default_tool: string;
  enabled: boolean;
}

export interface BoardTask {
  id: string;
  title: string;
  body: string | null;
  agentId: string | null;
  status: TaskStatus;
  priority: number;
  source: TaskSource;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  dueAt: string | null;
  lastResult: unknown;
}

export interface ActivityRow {
  id: number;
  taskId: string | null;
  agentId: string;
  surface: string;
  action: string;
  detail: unknown;
  externalUrl: string | null;
  createdAt: string;
}

function rowToTask(r: Record<string, unknown>): BoardTask {
  return {
    id: String(r.id),
    title: String(r.title),
    body: (r.body as string | null) ?? null,
    agentId: (r.agent_id as string | null) ?? null,
    status: r.status as TaskStatus,
    priority: Number(r.priority ?? 2),
    source: r.source as TaskSource,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: new Date(r.created_at as string).toISOString(),
    updatedAt: new Date(r.updated_at as string).toISOString(),
    dueAt: r.due_at ? new Date(r.due_at as string).toISOString() : null,
    lastResult: r.last_result ?? null,
  };
}

function rowToActivity(r: Record<string, unknown>): ActivityRow {
  return {
    id: Number(r.id),
    taskId: (r.task_id as string | null) ?? null,
    agentId: String(r.agent_id),
    surface: String(r.surface),
    action: String(r.action),
    detail: r.detail ?? {},
    externalUrl: (r.external_url as string | null) ?? null,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export async function listAgents(): Promise<AgentDef[]> {
  const r = await getPool().query<Record<string, unknown>>(
    `SELECT id, display_name, description, mcp_url, default_tool, enabled FROM agents.agent ORDER BY display_name`,
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    display_name: String(row.display_name),
    description: String(row.description),
    mcp_url: (row.mcp_url as string | null) ?? null,
    default_tool: String(row.default_tool),
    enabled: Boolean(row.enabled),
  }));
}

export async function listTasks(opts: { status?: TaskStatus; agentId?: string } = {}): Promise<BoardTask[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.status) { where.push(`status = $${args.length + 1}`); args.push(opts.status); }
  if (opts.agentId) { where.push(`agent_id = $${args.length + 1}`); args.push(opts.agentId); }
  const sql = `SELECT * FROM agents.task ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY priority DESC, created_at DESC LIMIT 500`;
  const r = await getPool().query<Record<string, unknown>>(sql, args);
  return r.rows.map(rowToTask);
}

export async function getTask(id: string): Promise<BoardTask | null> {
  const r = await getPool().query<Record<string, unknown>>(`SELECT * FROM agents.task WHERE id = $1`, [id]);
  return r.rows[0] ? rowToTask(r.rows[0]) : null;
}

export async function createTask(input: {
  title: string; body?: string; agentId?: string | null;
  priority?: number; source?: TaskSource; createdBy?: string | null; dueAt?: string | null;
}): Promise<BoardTask> {
  const r = await getPool().query<Record<string, unknown>>(
    `INSERT INTO agents.task (title, body, agent_id, status, priority, source, created_by, due_at)
     VALUES ($1, $2, $3, 'backlog', $4, $5, $6, $7) RETURNING *`,
    [input.title, input.body ?? null, input.agentId ?? null, input.priority ?? 2, input.source ?? "user", input.createdBy ?? null, input.dueAt ?? null],
  );
  return rowToTask(r.rows[0]!);
}

export async function patchTask(id: string, patch: { status?: TaskStatus; agentId?: string | null; priority?: number; lastResult?: unknown }): Promise<BoardTask | null> {
  const sets: string[] = ["updated_at = now()"];
  const args: unknown[] = [];
  if (patch.status) { sets.push(`status = $${args.length + 1}`); args.push(patch.status); }
  if (patch.agentId !== undefined) { sets.push(`agent_id = $${args.length + 1}`); args.push(patch.agentId); }
  if (patch.priority !== undefined) { sets.push(`priority = $${args.length + 1}`); args.push(patch.priority); }
  if (patch.lastResult !== undefined) { sets.push(`last_result = $${args.length + 1}::jsonb`); args.push(JSON.stringify(patch.lastResult)); }
  args.push(id);
  const r = await getPool().query<Record<string, unknown>>(
    `UPDATE agents.task SET ${sets.join(", ")} WHERE id = $${args.length} RETURNING *`,
    args,
  );
  return r.rows[0] ? rowToTask(r.rows[0]) : null;
}

export async function deleteTask(id: string): Promise<boolean> {
  const r = await getPool().query(`DELETE FROM agents.task WHERE id = $1`, [id]);
  return (r.rowCount ?? 0) > 0;
}

export async function listActivity(opts: { agentId?: string; taskId?: string; limit?: number } = {}): Promise<ActivityRow[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.agentId) { where.push(`agent_id = $${args.length + 1}`); args.push(opts.agentId); }
  if (opts.taskId) { where.push(`task_id = $${args.length + 1}`); args.push(opts.taskId); }
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  args.push(limit);
  const sql = `SELECT * FROM agents.activity ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT $${args.length}`;
  const r = await getPool().query<Record<string, unknown>>(sql, args);
  return r.rows.map(rowToActivity);
}

export async function insertActivity(input: {
  taskId?: string | null; agentId: string; surface: string; action: string; detail?: unknown; externalUrl?: string | null;
}): Promise<ActivityRow> {
  const r = await getPool().query<Record<string, unknown>>(
    `INSERT INTO agents.activity (task_id, agent_id, surface, action, detail, external_url)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING *`,
    [input.taskId ?? null, input.agentId, input.surface, input.action, JSON.stringify(input.detail ?? {}), input.externalUrl ?? null],
  );
  return rowToActivity(r.rows[0]!);
}
