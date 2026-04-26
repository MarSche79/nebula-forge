import { config } from "../config.js";
import { getOpenAI } from "../agent/openai-client.js";
import type { InterviewerAnalysis, HrManagerDecision } from "../db/applications.js";

interface JobInfo {
  title: string;
  department: string;
}

interface ScreeningResult {
  interviewerAnalysis: InterviewerAnalysis | null;
  hrManagerDecision: HrManagerDecision | null;
  threatDetected: boolean;
  threatTypes: string[];
}

const INTERVIEWER_SYSTEM = `You are the NebulaForge Interviewer Agent — an AI-powered HR screening system.
Analyze the CV against the job requirements. Output ONLY valid JSON:
{
  "matchScore": <integer 0-100>,
  "summary": "<2-3 sentence overview>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "gaps": ["<gap 1>", "<gap 2>"],
  "interviewFocus": ["<topic 1>", "<topic 2>", "<topic 3>"],
  "verdict": "<Strongly Recommend | Recommend | Consider | Not Recommended>"
}`;

const HR_MANAGER_SYSTEM = `You are the NebulaForge HR Manager Agent — final decision-support AI.
Review the Interviewer's assessment. Output ONLY valid JSON:
{
  "recommendation": "<Proceed to Technical Interview | Proceed to HR Interview | Hold for Future Roles | Decline>",
  "rationale": "<2-3 sentences>",
  "nextSteps": "<specific action for HR team>",
  "riskFlags": []
}`;

/**
 * Detects when Azure OpenAI's content filter blocked a request.
 * The OpenAI SDK throws an error with status 400 and a `content_filter` code
 * (and an inner `code` like `jailbreak` / `hate` / etc.) when this happens.
 */
function classifyContentFilterError(err: unknown): string[] | null {
  const e = err as {
    status?: number;
    code?: string;
    error?: { code?: string; innererror?: { code?: string; content_filter_result?: Record<string, { filtered?: boolean }> } };
    message?: string;
  };

  const status = e?.status;
  const code = e?.code ?? e?.error?.code;
  const inner = e?.error?.innererror;
  const innerCode = inner?.code;

  const isFilter =
    code === "content_filter" ||
    innerCode === "ResponsibleAIPolicyViolation" ||
    typeof e?.message === "string" && /content[_ ]filter|filtered|responsible.?ai/i.test(e.message);

  if (status !== 400 && !isFilter) return null;

  const types = new Set<string>();
  if (innerCode) types.add(innerCode);
  // Per-category flags — present on jailbreak / prompt-shield style filters
  const cats = inner?.content_filter_result;
  if (cats) {
    for (const [name, val] of Object.entries(cats)) {
      if (val?.filtered) types.add(name);
    }
  }
  if (types.size === 0) types.add("content_filter");
  return Array.from(types);
}

/**
 * Runs the two-agent screening pipeline. Catches Azure OpenAI content-filter
 * rejections and reports them as `threatDetected`. Never logs raw CV text or
 * full upstream error bodies.
 */
export async function runScreening(
  cvText: string,
  candidateName: string,
  job: JobInfo,
): Promise<ScreeningResult> {
  if (!config.azureOpenAiEndpoint) {
    return { interviewerAnalysis: null, hrManagerDecision: null, threatDetected: false, threatTypes: [] };
  }

  const openai = getOpenAI();

  // 1. Interviewer
  let interviewerAnalysis: InterviewerAnalysis | null = null;
  try {
    const resp = await openai.chat.completions.create({
      model: config.openaiDeployment,
      messages: [
        { role: "system", content: INTERVIEWER_SYSTEM },
        { role: "user", content: `Analyze this candidate for ${job.title} (${job.department}).\n\nCV:\n${cvText}` },
      ],
      max_tokens: 800,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    const content = resp.choices[0]?.message?.content ?? "";
    interviewerAnalysis = JSON.parse(content) as InterviewerAnalysis;
  } catch (err) {
    const types = classifyContentFilterError(err);
    if (types) {
      console.warn(`[hr-pipeline] interviewer blocked by content filter for ${job.title}: ${types.join(",")}`);
      return { interviewerAnalysis: null, hrManagerDecision: null, threatDetected: true, threatTypes: types };
    }
    console.warn(`[hr-pipeline] interviewer error: ${(err as Error).message}`);
    return { interviewerAnalysis: null, hrManagerDecision: null, threatDetected: false, threatTypes: [] };
  }

  // 2. HR Manager
  let hrManagerDecision: HrManagerDecision | null = null;
  try {
    const resp = await openai.chat.completions.create({
      model: config.openaiDeployment,
      messages: [
        { role: "system", content: HR_MANAGER_SYSTEM },
        { role: "user", content:
            `Review assessment for ${candidateName} applying for ${job.title}:
Match: ${interviewerAnalysis.matchScore}% | Verdict: ${interviewerAnalysis.verdict}
Summary: ${interviewerAnalysis.summary}
Strengths: ${(interviewerAnalysis.strengths ?? []).join(", ")}
Gaps: ${(interviewerAnalysis.gaps ?? []).join(", ")}` },
      ],
      max_tokens: 500,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    const content = resp.choices[0]?.message?.content ?? "";
    hrManagerDecision = JSON.parse(content) as HrManagerDecision;
  } catch (err) {
    const types = classifyContentFilterError(err);
    if (types) {
      console.warn(`[hr-pipeline] HR manager blocked by content filter: ${types.join(",")}`);
      return { interviewerAnalysis, hrManagerDecision: null, threatDetected: true, threatTypes: types };
    }
    console.warn(`[hr-pipeline] HR manager error: ${(err as Error).message}`);
  }

  return { interviewerAnalysis, hrManagerDecision, threatDetected: false, threatTypes: [] };
}
