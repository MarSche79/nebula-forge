import { Router } from "express";
import { z } from "zod";
import { createRequire } from "node:module";
import { requireAuth } from "../auth/jwt.js";
import {
  createApplication,
  listApplications,
  getApplication,
  setDecision,
  deleteApplication,
  deleteDemoApplications,
  recentByEmailAndJob,
  counts,
  type ApplicationStatus,
  type ApplicationSource,
} from "../db/applications.js";
import { isPostgresConfigured } from "../db/postgres.js";
import { jobMeta } from "../hr/jobs.js";
import { runScreening } from "../hr/pipeline.js";

const require = createRequire(import.meta.url);
const demoCvs = require("../data/demo-cvs.json") as Record<string, string>;

export const applicationsRouter = Router();

// ---- public: submit ----
const SubmitBody = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(180),
  jobId: z.string().trim().min(1).max(40),
  cvText: z.string().min(1).max(24_000),
  coverNote: z.string().max(2_000).optional().default(""),
  fileName: z.string().max(200).optional().default(""),
});

// In-memory per-IP rate limiter (5 submits per hour per IP).
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const ipBuckets = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (ipBuckets.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (arr.length >= RATE_LIMIT_MAX) {
    ipBuckets.set(ip, arr);
    return true;
  }
  arr.push(now);
  ipBuckets.set(ip, arr);
  return false;
}

function clientIp(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
  const xff = req.headers["x-forwarded-for"];
  const xffStr = Array.isArray(xff) ? xff[0] : xff;
  if (typeof xffStr === "string" && xffStr.length > 0) return xffStr.split(",")[0]!.trim();
  return req.ip ?? "unknown";
}

applicationsRouter.post("/", async (req, res) => {
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "Application storage is not configured." });
    return;
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    res.status(429).json({ error: "Too many applications from this address. Try again later." });
    return;
  }

  const parsed = SubmitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", detail: parsed.error.flatten() });
    return;
  }
  const { name, email, jobId, cvText, coverNote, fileName } = parsed.data;
  const job = jobMeta(jobId);
  if (!job) {
    res.status(400).json({ error: `Unknown jobId: ${jobId}` });
    return;
  }

  // 30-second per-(email, job) duplicate suppression.
  if (await recentByEmailAndJob(email, jobId, 30)) {
    res.status(429).json({ error: "We just received an application from you for this role. Please give it a moment." });
    return;
  }

  const screening = await runScreening(cvText, name, job);
  try {
    const app = await createApplication({
      name, email, jobId, jobTitle: job.title, department: job.department,
      cvText, coverNote, fileName,
      ...screening,
    });
    res.status(201).json(toPublicSummary(app));
  } catch (err) {
    console.error("[applications] create failed:", (err as Error).message);
    res.status(503).json({ error: "Application analysis succeeded but could not be stored. Please try again." });
  }
});

// ---- HR portal endpoints (auth required) ----
applicationsRouter.get("/", requireAuth, async (req, res) => {
  const qs = (k: string): string | undefined => {
    const v = req.query[k];
    if (typeof v === "string") return v;
    if (Array.isArray(v) && typeof v[0] === "string") return v[0];
    return undefined;
  };
  const status = qs("status") as ApplicationStatus | "All" | undefined;
  const department = qs("department");
  const threatOnly = qs("threatOnly") === "true";
  const source = qs("source") as ApplicationSource | "all" | undefined;
  const list = await listApplications({ status, department, threatOnly, source });
  res.json(list);
});

applicationsRouter.get("/counts", requireAuth, async (_req, res) => {
  res.json(await counts());
});

applicationsRouter.get("/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id ?? "");
  const app = await getApplication(id);
  if (!app) { res.status(404).json({ error: "Not found" }); return; }
  res.json(app);
});

const DecisionBody = z.object({
  decision: z.enum(["Hired", "Rejected"]).nullable().optional(),
  status: z.enum(["New", "Screened", "Flagged"]).optional(),
  action: z.enum(["delete"]).optional(),
});

applicationsRouter.post("/:id/decision", requireAuth, async (req, res) => {
  const parsed = DecisionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", detail: parsed.error.flatten() });
    return;
  }
  const id = String(req.params.id ?? "");
  if (parsed.data.action === "delete") {
    await deleteApplication(id);
    res.json({ ok: true, deleted: true });
    return;
  }
  await setDecision(id, parsed.data.decision ?? null, parsed.data.status ?? "Screened");
  res.json({ ok: true });
});

applicationsRouter.post("/cleanup-demo", requireAuth, async (_req, res) => {
  const removed = await deleteDemoApplications();
  res.json({ ok: true, removed });
});

// ---- Demo: submit one of the canned attack CVs (auth required) ----
const DemoBody = z.object({
  cvKey: z.enum(["alex-mercer", "sofia-reyes", "tomas-dvorak", "priya-chakraborty", "marcus-lindqvist"]),
});

const DEMO_META: Record<string, { name: string; email: string; jobId: string; fileName: string }> = {
  "alex-mercer":      { name: "Alex Mercer",      email: "alex.mercer@example.com",      jobId: "sec-001",   fileName: "alex-mercer-cv.pdf" },
  "sofia-reyes":      { name: "Sofia Reyes",      email: "sofia.reyes@example.com",      jobId: "eng-001",   fileName: "sofia-reyes-cv.pdf" },
  "tomas-dvorak":     { name: "Tomáš Dvořák",     email: "tomas.dvorak@example.com",     jobId: "eng-002",   fileName: "tomas-dvorak-cv.pdf" },
  "priya-chakraborty":{ name: "Priya Chakraborty",email: "priya.chakraborty@example.com",jobId: "mkt-001",   fileName: "priya-chakraborty-cv.pdf" },
  "marcus-lindqvist": { name: "Marcus Lindqvist", email: "marcus.lindqvist@example.com", jobId: "sales-002", fileName: "marcus-lindqvist-cv.pdf" },
};

export const demoRouter = Router();
demoRouter.post("/submit", requireAuth, async (req, res) => {
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "Application storage is not configured." });
    return;
  }
  const parsed = DemoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", detail: parsed.error.flatten() });
    return;
  }
  const meta = DEMO_META[parsed.data.cvKey];
  const cvText = demoCvs[parsed.data.cvKey];
  if (!meta || !cvText) {
    res.status(404).json({ error: "Unknown demo CV" });
    return;
  }
  const job = jobMeta(meta.jobId);
  if (!job) { res.status(500).json({ error: "Demo CV references unknown job" }); return; }

  const screening = await runScreening(cvText, meta.name, job);
  const app = await createApplication({
    name: meta.name,
    email: meta.email,
    jobId: meta.jobId,
    jobTitle: job.title,
    department: job.department,
    cvText,
    coverNote: "Submitted via /hr/demo",
    fileName: meta.fileName,
    source: "demo",
    ...screening,
  });
  res.status(201).json(toPublicSummary(app));
});

// Trim the response shown to anonymous submitters (don't echo CV text back).
function toPublicSummary(a: { id: string; status: string; matchScore: number | null; threatDetected: boolean; threatTypes: string[]; submittedAt: string }) {
  return {
    id: a.id,
    status: a.status,
    matchScore: a.matchScore,
    threatDetected: a.threatDetected,
    threatTypes: a.threatTypes,
    submittedAt: a.submittedAt,
  };
}
