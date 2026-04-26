// Typed client for the application/HR endpoints. Uses same-origin /api/*
// — the browser never talks directly to the API.

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

export type ApplicationStatus = 'New' | 'Screened' | 'Flagged';
export type ApplicationDecision = 'Hired' | 'Rejected' | null;
export type ApplicationSource = 'web' | 'demo';

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

export interface SubmitResponse {
  id: string;
  status: ApplicationStatus;
  matchScore: number | null;
  threatDetected: boolean;
  threatTypes: string[];
  submittedAt: string;
}

export interface SubmitInput {
  name: string;
  email: string;
  jobId: string;
  cvText: string;
  coverNote?: string;
  fileName?: string;
}

export interface AppCounts {
  total: number;
  thisWeek: number;
  flagged: number;
  screened: number;
  hired: number;
  rejected: number;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const ct = res.headers.get('content-type') ?? '';
  const body = ct.includes('application/json') ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

export async function submitApplication(input: SubmitInput): Promise<SubmitResponse> {
  const res = await fetch('/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return jsonOrThrow<SubmitResponse>(res);
}

export interface ListFilter {
  status?: ApplicationStatus | 'All';
  department?: string;
  threatOnly?: boolean;
  source?: ApplicationSource | 'all';
}

export async function listApplications(filter: ListFilter = {}): Promise<Application[]> {
  const qs = new URLSearchParams();
  if (filter.status && filter.status !== 'All') qs.set('status', filter.status);
  if (filter.department) qs.set('department', filter.department);
  if (filter.threatOnly) qs.set('threatOnly', 'true');
  if (filter.source) qs.set('source', filter.source);
  const url = `/api/applications${qs.toString() ? `?${qs.toString()}` : ''}`;
  const res = await fetch(url, { cache: 'no-store' });
  return jsonOrThrow<Application[]>(res);
}

export async function getApplication(id: string): Promise<Application> {
  const res = await fetch(`/api/applications/${id}`, { cache: 'no-store' });
  return jsonOrThrow<Application>(res);
}

export async function getCounts(): Promise<AppCounts> {
  const res = await fetch('/api/applications/counts', { cache: 'no-store' });
  return jsonOrThrow<AppCounts>(res);
}

export async function setDecision(id: string, decision: 'Hired' | 'Rejected'): Promise<void> {
  const res = await fetch(`/api/applications/${id}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, status: 'Screened' }),
  });
  await jsonOrThrow(res);
}

export async function deleteApplicationApi(id: string): Promise<void> {
  const res = await fetch(`/api/applications/${id}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete' }),
  });
  await jsonOrThrow(res);
}

export async function cleanupDemo(): Promise<{ removed: number }> {
  const res = await fetch('/api/applications/cleanup-demo', { method: 'POST' });
  return jsonOrThrow<{ removed: number }>(res);
}

export type DemoCvKey =
  | 'alex-mercer'
  | 'sofia-reyes'
  | 'tomas-dvorak'
  | 'priya-chakraborty'
  | 'marcus-lindqvist';

export async function submitDemoCv(cvKey: DemoCvKey): Promise<SubmitResponse> {
  const res = await fetch('/api/demo/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cvKey }),
  });
  return jsonOrThrow<SubmitResponse>(res);
}
