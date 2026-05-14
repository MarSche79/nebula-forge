import { z } from "zod";
import {
  createMcpServer,
  startServer,
  AgentConfig,
  ensureTable,
  getAll,
  upsertEntity,
  postWebhook,
  logActivity,
  nfId,
} from "@nebula-forge/shared";

const PARTITION_KEY = "nebula-forge";
const TABLE_SIGNALS = "nfAuditorSignals";

const config: AgentConfig = {
  name: "Astra Auditor",
  version: "1.0.0",
  description:
    "Defender / Entra audit signaller. Pushes synthetic risky-sign-in, mailbox-rule, and app-consent signals into a Log Analytics custom table via a Logic App so Defender XDR / Sentinel can raise custom detections.",
  port: 3013,
  instructions:
    "You are Astra Auditor. Generate believable but synthetic security signals. Always tag them as demo data so blue-team scenarios are reproducible.",
};

const SIGNAL_TEMPLATES = {
  "risky-sign-in": (user: string) => ({
    eventType: "RiskyUserSignIn", user, ipAddress: "185.220.101.42",
    location: "Unknown / Tor exit node", riskLevel: "high",
    detail: "Sign-in from an anonymized IP; impossible-travel from previous EU login 12 minutes earlier.",
  }),
  "mailbox-rule": (user: string) => ({
    eventType: "SuspiciousInboxRule", user,
    ruleName: "•",
    action: "MoveToFolder=RSS Subscriptions; MarkAsRead=true; ForwardTo=external@throwaway.tld",
    detail: "Hidden inbox rule with single-character name auto-forwards finance keywords externally.",
  }),
  "app-consent": (user: string) => ({
    eventType: "OAuthAppConsentGrant", user,
    appName: "DocSync Pro Free", publisher: "(unverified)",
    permissionsGranted: ["Mail.ReadWrite", "Files.Read.All", "User.Read.All"],
    detail: "User consented to a high-risk multi-tenant app with Mail.ReadWrite + Files.Read.All scopes.",
  }),
  "mass-download": (user: string) => ({
    eventType: "MassFileDownload", user,
    fileCount: 2173, sizeMb: 8112, sourceSite: "NebulaForgeAgentSharePoint",
    detail: "User downloaded 2,173 files in 4 minutes from the agent SharePoint site.",
  }),
} as const;

type SignalKind = keyof typeof SIGNAL_TEMPLATES;

async function main() {
  await ensureTable(TABLE_SIGNALS);
  const server = createMcpServer(config);

  // --- Tool 1: emit_signal ---
  server.tool(
    "emit_signal",
    "Emit a synthetic Defender/Entra signal to the Log Analytics custom table via the audit Logic App.",
    {
      kind: z.enum(["risky-sign-in", "mailbox-rule", "app-consent", "mass-download"]),
      user: z.string().default("agentops@nebula-forge.local"),
      taskId: z.string().optional(),
    },
    async ({ kind, user, taskId }) => {
      const id = nfId("SIG");
      const payload = (SIGNAL_TEMPLATES[kind as SignalKind])(user);
      const record = { id, ...payload, demo: true, emittedAt: new Date().toISOString(), taskId: taskId ?? null };
      const r = await postWebhook(process.env.LA_DEFENDER_WEBHOOK, record);
      await upsertEntity(TABLE_SIGNALS, PARTITION_KEY, id, { id, kind, user, status: r.ok ? "emitted" : "failed", emittedAt: record.emittedAt, taskId: taskId ?? null });
      await logActivity({
        taskId, agentId: "auditor", surface: "defender", action: r.ok ? "signal_emitted" : "signal_failed",
        detail: { id, kind, user, status: r.status },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: r.ok, id, kind }, null, 2) }] };
    },
  );

  // --- Tool 2: list_signals ---
  server.tool(
    "list_signals",
    "List signals emitted by the Auditor.",
    { limit: z.number().int().min(1).max(100).default(20) },
    async ({ limit }) => {
      const sigs = await getAll<Record<string, unknown>>(TABLE_SIGNALS, PARTITION_KEY);
      sigs.sort((a, b) => String(b.emittedAt ?? "").localeCompare(String(a.emittedAt ?? "")));
      return { content: [{ type: "text" as const, text: JSON.stringify({ total: sigs.length, signals: sigs.slice(0, limit) }, null, 2) }] };
    },
  );

  // --- Tool 3: emit_burst ---
  server.tool(
    "emit_burst",
    "Emit a burst of mixed signals to make the Defender / Sentinel timeline look populated.",
    { count: z.number().int().min(1).max(20).default(5), taskId: z.string().optional() },
    async ({ count, taskId }) => {
      const kinds = Object.keys(SIGNAL_TEMPLATES) as SignalKind[];
      const results: { kind: string; ok: boolean }[] = [];
      for (let i = 0; i < count; i++) {
        const k = kinds[Math.floor(Math.random() * kinds.length)]!;
        const r = await postWebhook(process.env.LA_DEFENDER_WEBHOOK, { id: nfId("SIG"), ...SIGNAL_TEMPLATES[k](`crew-${100 + Math.floor(Math.random() * 50)}@nebula-forge.local`), demo: true, emittedAt: new Date().toISOString() });
        results.push({ kind: k, ok: r.ok });
      }
      await logActivity({
        taskId, agentId: "auditor", surface: "defender", action: "burst_emitted",
        detail: { count, results },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({ count, results }, null, 2) }] };
    },
  );

  // --- Tool 4: describe_kinds ---
  server.tool(
    "describe_kinds",
    "Describe the synthetic signal kinds the Auditor can produce.",
    {},
    async () => ({ content: [{ type: "text" as const, text: JSON.stringify(Object.keys(SIGNAL_TEMPLATES).map((k) => ({ kind: k, sample: SIGNAL_TEMPLATES[k as SignalKind]("alice@nebula-forge.local") })), null, 2) }] }),
  );

  // --- Tool 5: autonomous_tick ---
  server.tool(
    "autonomous_tick",
    "Pick a random signal kind and emit one. Used by the cron job for steady Defender activity.",
    { taskId: z.string().optional() },
    async ({ taskId }) => {
      const kinds = Object.keys(SIGNAL_TEMPLATES) as SignalKind[];
      const k = kinds[Math.floor(Math.random() * kinds.length)]!;
      const id = nfId("SIG");
      const payload = SIGNAL_TEMPLATES[k](`crew-${100 + Math.floor(Math.random() * 50)}@nebula-forge.local`);
      const r = await postWebhook(process.env.LA_DEFENDER_WEBHOOK, { id, ...payload, demo: true, emittedAt: new Date().toISOString() });
      await logActivity({
        taskId, agentId: "auditor", surface: "defender", action: r.ok ? "auto_signal_emitted" : "auto_signal_failed",
        detail: { id, kind: k, status: r.status },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: r.ok, kind: k, id }, null, 2) }] };
    },
  );

  await startServer(server, config);
}

main().catch(console.error);
