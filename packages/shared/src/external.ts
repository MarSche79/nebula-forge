// External integration helpers for the "agent army" — wraps Power Automate /
// Logic App webhook calls and the activity-feed callback to the API.

export interface WebhookPostResult {
  ok: boolean;
  status: number;
  body?: string;
}

export async function postWebhook(
  url: string | undefined,
  payload: Record<string, unknown>,
  timeoutMs = 15_000,
): Promise<WebhookPostResult> {
  if (!url) {
    console.warn("[webhook] no URL configured, skipping");
    return { ok: false, status: 0, body: "no-url-configured" };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const body = await r.text().catch(() => "");
    return { ok: r.ok, status: r.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: (err as Error).message };
  } finally {
    clearTimeout(t);
  }
}

export interface ActivityEvent {
  taskId?: string | null;
  agentId: string;
  surface: "sharepoint" | "teams" | "purview" | "defender" | "system";
  action: string;
  detail: Record<string, unknown>;
  externalUrl?: string;
}

/**
 * Log an activity entry back to the API. Agents post to the API on an
 * internal-only endpoint; the API is responsible for persisting in Postgres.
 */
export async function logActivity(event: ActivityEvent): Promise<void> {
  const base = process.env.API_INTERNAL_URL;
  const secret = process.env.AGENT_CALLBACK_SECRET;
  if (!base) {
    console.warn("[activity] API_INTERNAL_URL not set — activity dropped");
    return;
  }
  try {
    await fetch(`${base.replace(/\/$/, "")}/api/board/activity`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-callback-secret": secret ?? "",
      },
      body: JSON.stringify(event),
    });
  } catch (err) {
    console.warn("[activity] post failed:", (err as Error).message);
  }
}

export function nfId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
