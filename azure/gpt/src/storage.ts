import { getPool } from "./db.js";

export interface Session {
  id: string;
  userOid: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  citations: Citation[];
  createdAt: string;
}

export interface Citation {
  title: string;
  url?: string;
  snippet?: string;
  source: "sharepoint" | "teams" | "email" | "upload" | "web" | "workiq";
}

export interface Upload {
  id: string;
  userOid: string;
  fileName: string;
  size: number;
  contentType: string;
  sharepointUrl: string | null;
  createdAt: string;
}

export async function createSession(userOid: string, title: string): Promise<Session> {
  const r = await getPool().query<Record<string, unknown>>(
    `INSERT INTO gpt.session (user_oid, title) VALUES ($1, $2) RETURNING *`,
    [userOid, title],
  );
  return rowToSession(r.rows[0]!);
}

export async function listSessions(userOid: string): Promise<Session[]> {
  const r = await getPool().query<Record<string, unknown>>(
    `SELECT * FROM gpt.session WHERE user_oid = $1 ORDER BY updated_at DESC LIMIT 200`,
    [userOid],
  );
  return r.rows.map(rowToSession);
}

export async function getSession(id: string, userOid: string): Promise<Session | null> {
  const r = await getPool().query<Record<string, unknown>>(
    `SELECT * FROM gpt.session WHERE id = $1 AND user_oid = $2`,
    [id, userOid],
  );
  return r.rows[0] ? rowToSession(r.rows[0]) : null;
}

export async function deleteSession(id: string, userOid: string): Promise<boolean> {
  const r = await getPool().query(`DELETE FROM gpt.session WHERE id = $1 AND user_oid = $2`, [id, userOid]);
  return (r.rowCount ?? 0) > 0;
}

export async function renameSession(id: string, userOid: string, title: string): Promise<void> {
  await getPool().query(`UPDATE gpt.session SET title = $3, updated_at = now() WHERE id = $1 AND user_oid = $2`, [id, userOid, title]);
}

export async function appendMessage(sessionId: string, role: Message["role"], content: string, citations: Citation[] = []): Promise<Message> {
  const r = await getPool().query<Record<string, unknown>>(
    `INSERT INTO gpt.message (session_id, role, content, citations) VALUES ($1, $2, $3, $4::jsonb) RETURNING *`,
    [sessionId, role, content, JSON.stringify(citations)],
  );
  await getPool().query(`UPDATE gpt.session SET updated_at = now() WHERE id = $1`, [sessionId]);
  return rowToMessage(r.rows[0]!);
}

export async function listMessages(sessionId: string): Promise<Message[]> {
  const r = await getPool().query<Record<string, unknown>>(
    `SELECT * FROM gpt.message WHERE session_id = $1 ORDER BY created_at ASC LIMIT 500`,
    [sessionId],
  );
  return r.rows.map(rowToMessage);
}

export async function insertUpload(input: { userOid: string; fileName: string; size: number; contentType: string; sharepointUrl: string | null }): Promise<Upload> {
  const r = await getPool().query<Record<string, unknown>>(
    `INSERT INTO gpt.upload (user_oid, file_name, size, content_type, sharepoint_url) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.userOid, input.fileName, input.size, input.contentType, input.sharepointUrl],
  );
  return rowToUpload(r.rows[0]!);
}

export async function listUploads(userOid: string): Promise<Upload[]> {
  const r = await getPool().query<Record<string, unknown>>(
    `SELECT * FROM gpt.upload WHERE user_oid = $1 ORDER BY created_at DESC LIMIT 200`,
    [userOid],
  );
  return r.rows.map(rowToUpload);
}

function rowToSession(r: Record<string, unknown>): Session {
  return {
    id: String(r.id),
    userOid: String(r.user_oid),
    title: String(r.title),
    createdAt: new Date(r.created_at as string).toISOString(),
    updatedAt: new Date(r.updated_at as string).toISOString(),
  };
}

function rowToMessage(r: Record<string, unknown>): Message {
  return {
    id: String(r.id),
    sessionId: String(r.session_id),
    role: r.role as Message["role"],
    content: String(r.content ?? ""),
    citations: (r.citations as Citation[]) ?? [],
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

function rowToUpload(r: Record<string, unknown>): Upload {
  return {
    id: String(r.id),
    userOid: String(r.user_oid),
    fileName: String(r.file_name),
    size: Number(r.size ?? 0),
    contentType: String(r.content_type ?? ""),
    sharepointUrl: (r.sharepoint_url as string | null) ?? null,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}
