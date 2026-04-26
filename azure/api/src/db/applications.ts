import { v4 as uuidv4 } from "uuid";
import { getPool } from "./postgres.js";

export type ApplicationStatus = "New" | "Screened" | "Flagged";
export type ApplicationDecision = "Hired" | "Rejected" | null;
export type ApplicationSource = "web" | "demo";

export interface InterviewerAnalysis {
  matchScore: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  interviewFocus: string[];
  verdict: string;
}

export interface HrManagerDecision {
  recommendation: string;
  rationale: string;
  nextSteps: string;
  riskFlags: string[];
}

export interface Application {
  id: string;
  name: string;
  email: string;
  jobId: string;
  jobTitle: string;
  department: string;
  cvText: string;
  coverNote: string;
  fileName: string;
  status: ApplicationStatus;
  matchScore: number | null;
  recommendation: string | null;
  interviewerAnalysis: InterviewerAnalysis | null;
  hrManagerDecision: HrManagerDecision | null;
  threatDetected: boolean;
  threatTypes: string[];
  decision: ApplicationDecision;
  source: ApplicationSource;
  submittedAt: string;
  screenedAt: string | null;
}

interface CreateInput {
  name: string;
  email: string;
  jobId: string;
  jobTitle: string;
  department: string;
  cvText: string;
  coverNote?: string;
  fileName?: string;
  source?: ApplicationSource;
  interviewerAnalysis?: InterviewerAnalysis | null;
  hrManagerDecision?: HrManagerDecision | null;
  threatDetected?: boolean;
  threatTypes?: string[];
}

interface ListFilter {
  status?: ApplicationStatus | "All";
  department?: string;
  threatOnly?: boolean;
  source?: ApplicationSource | "all";
  limit?: number;
}

function rowToApplication(r: Record<string, unknown>): Application {
  const safeParse = (v: unknown): unknown => {
    if (v == null) return null;
    if (typeof v === "object") return v;
    if (typeof v === "string" && v.length > 0) {
      try { return JSON.parse(v); } catch { return null; }
    }
    return null;
  };
  const types = (r.threat_types as string | null) ?? "";
  return {
    id: String(r.id),
    name: String(r.name),
    email: String(r.email),
    jobId: String(r.job_id),
    jobTitle: String(r.job_title ?? ""),
    department: String(r.department ?? ""),
    cvText: String(r.cv_text ?? ""),
    coverNote: String(r.cover_note ?? ""),
    fileName: String(r.file_name ?? ""),
    status: (r.status as ApplicationStatus) ?? "New",
    matchScore: r.match_score === null ? null : Number(r.match_score),
    recommendation: (r.recommendation as string) ?? null,
    interviewerAnalysis: safeParse(r.interviewer_json) as InterviewerAnalysis | null,
    hrManagerDecision: safeParse(r.hr_manager_json) as HrManagerDecision | null,
    threatDetected: !!r.threat_detected,
    threatTypes: types.length > 0 ? types.split(",").filter(Boolean) : [],
    decision: (r.decision as ApplicationDecision) ?? null,
    source: ((r.source as ApplicationSource) ?? "web"),
    submittedAt: new Date(r.submitted_at as string).toISOString(),
    screenedAt: r.screened_at ? new Date(r.screened_at as string).toISOString() : null,
  };
}

export async function createApplication(input: CreateInput): Promise<Application> {
  const id = uuidv4();
  const now = new Date();
  const status: ApplicationStatus = input.threatDetected
    ? "Flagged"
    : (input.interviewerAnalysis ? "Screened" : "New");
  const screenedAt = input.interviewerAnalysis ? now : null;

  const sql = `
    INSERT INTO candidates
      (id, name, email, job_id, job_title, department, cv_text, cover_note, file_name,
       status, match_score, recommendation, interviewer_json, hr_manager_json,
       threat_detected, threat_types, decision, source, submitted_at, screened_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    RETURNING *`;

  const params = [
    id,
    input.name,
    input.email,
    input.jobId,
    input.jobTitle,
    input.department,
    input.cvText,
    input.coverNote ?? "",
    input.fileName ?? "",
    status,
    input.interviewerAnalysis?.matchScore ?? null,
    input.hrManagerDecision?.recommendation ?? null,
    input.interviewerAnalysis ? JSON.stringify(input.interviewerAnalysis) : null,
    input.hrManagerDecision ? JSON.stringify(input.hrManagerDecision) : null,
    !!input.threatDetected,
    (input.threatTypes ?? []).join(","),
    null,
    input.source ?? "web",
    now,
    screenedAt,
  ];
  const { rows } = await getPool().query(sql, params);
  return rowToApplication(rows[0]);
}

export async function listApplications(filter: ListFilter = {}): Promise<Application[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (filter.status && filter.status !== "All") {
    where.push(`status = $${i++}`);
    params.push(filter.status);
  }
  if (filter.department) {
    where.push(`department = $${i++}`);
    params.push(filter.department);
  }
  if (filter.threatOnly) {
    where.push(`threat_detected = TRUE`);
  }
  if (filter.source && filter.source !== "all") {
    where.push(`source = $${i++}`);
    params.push(filter.source);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(filter.limit ?? 200, 500);
  const sql = `SELECT * FROM candidates ${whereSql} ORDER BY submitted_at DESC LIMIT ${limit}`;
  const { rows } = await getPool().query(sql, params);
  return rows.map(rowToApplication);
}

export async function getApplication(id: string): Promise<Application | null> {
  const { rows } = await getPool().query("SELECT * FROM candidates WHERE id = $1", [id]);
  return rows[0] ? rowToApplication(rows[0]) : null;
}

export async function setDecision(
  id: string,
  decision: ApplicationDecision,
  status: ApplicationStatus = "Screened",
): Promise<void> {
  await getPool().query(
    "UPDATE candidates SET decision = $1, status = $2 WHERE id = $3",
    [decision, status, id],
  );
}

export async function deleteApplication(id: string): Promise<void> {
  await getPool().query("DELETE FROM candidates WHERE id = $1", [id]);
}

export async function deleteDemoApplications(): Promise<number> {
  const r = await getPool().query("DELETE FROM candidates WHERE source = 'demo'");
  return r.rowCount ?? 0;
}

export async function recentByEmailAndJob(
  email: string,
  jobId: string,
  withinSeconds: number,
): Promise<boolean> {
  const { rows } = await getPool().query(
    `SELECT 1 FROM candidates
     WHERE email = $1 AND job_id = $2 AND submitted_at > NOW() - ($3::int * INTERVAL '1 second')
     LIMIT 1`,
    [email, jobId, withinSeconds],
  );
  return rows.length > 0;
}

export async function counts(): Promise<{
  total: number;
  thisWeek: number;
  flagged: number;
  screened: number;
  hired: number;
  rejected: number;
}> {
  const sql = `
    SELECT
      COUNT(*) FILTER (WHERE source = 'web')                              AS total,
      COUNT(*) FILTER (WHERE source = 'web' AND submitted_at > NOW() - INTERVAL '7 days') AS this_week,
      COUNT(*) FILTER (WHERE source = 'web' AND threat_detected = TRUE)   AS flagged,
      COUNT(*) FILTER (WHERE source = 'web' AND status = 'Screened')      AS screened,
      COUNT(*) FILTER (WHERE source = 'web' AND decision = 'Hired')       AS hired,
      COUNT(*) FILTER (WHERE source = 'web' AND decision = 'Rejected')    AS rejected
    FROM candidates`;
  const { rows } = await getPool().query(sql);
  const r = rows[0] ?? {};
  return {
    total:    Number(r.total ?? 0),
    thisWeek: Number(r.this_week ?? 0),
    flagged:  Number(r.flagged ?? 0),
    screened: Number(r.screened ?? 0),
    hired:    Number(r.hired ?? 0),
    rejected: Number(r.rejected ?? 0),
  };
}
