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
const TABLE_INVESTIGATIONS = "nfSentinelInv";

const config: AgentConfig = {
  name: "Quasar Sentinel",
  version: "1.0.0",
  description:
    "Compliance investigator. Tags SharePoint docs with Purview sensitivity labels, runs eDiscovery-style sweeps, and logs investigations into the activity feed.",
  port: 3012,
  instructions:
    "You are Quasar Sentinel, station compliance officer. Sweep recent docs/posts for risky patterns, apply Purview labels, file investigations.",
};

async function main() {
  await ensureTable(TABLE_INVESTIGATIONS);
  const server = createMcpServer(config);

  // --- Tool 1: open_investigation ---
  server.tool(
    "open_investigation",
    "Open a compliance investigation for a target (file/post/user). Logged to the activity feed under 'purview'.",
    {
      target: z.string().describe("URL, file name, or user identifier"),
      reason: z.string().describe("Short reason summary"),
      severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      taskId: z.string().optional(),
    },
    async ({ target, reason, severity, taskId }) => {
      const id = nfId("INV");
      const inv = { id, target, reason, severity, status: "open", openedAt: new Date().toISOString(), taskId: taskId ?? null };
      await upsertEntity(TABLE_INVESTIGATIONS, PARTITION_KEY, id, inv);
      await logActivity({
        taskId, agentId: "sentinel", surface: "purview", action: "investigation_opened",
        detail: { id, target, reason, severity },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(inv, null, 2) }] };
    },
  );

  // --- Tool 2: apply_label ---
  server.tool(
    "apply_label",
    "Apply a Purview sensitivity label to a SharePoint file via the label Power Automate flow.",
    {
      fileName: z.string(),
      folder: z.string().default("AgentDrops"),
      label: z.enum(["Public", "Internal", "Confidential", "HighlyConfidential"]),
      taskId: z.string().optional(),
    },
    async ({ fileName, folder, label, taskId }) => {
      const r = await postWebhook(process.env.PA_SP_LABEL_WEBHOOK, { fileName, folder, label });
      await logActivity({
        taskId, agentId: "sentinel", surface: "purview", action: "label_applied",
        detail: { fileName, folder, label, status: r.status },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: r.ok, fileName, label }, null, 2) }] };
    },
  );

  // --- Tool 3: sweep_recent ---
  server.tool(
    "sweep_recent",
    "Look at recent investigations and produce a roll-up.",
    { sinceHours: z.number().int().min(1).max(168).default(24) },
    async ({ sinceHours }) => {
      const cutoff = Date.now() - sinceHours * 3600 * 1000;
      const all = await getAll<Record<string, unknown>>(TABLE_INVESTIGATIONS, PARTITION_KEY);
      const recent = all.filter((i) => new Date(String(i.openedAt ?? 0)).getTime() >= cutoff);
      const bySeverity = recent.reduce<Record<string, number>>((acc, i) => {
        const s = String(i.severity ?? "unknown");
        acc[s] = (acc[s] ?? 0) + 1; return acc;
      }, {});
      return { content: [{ type: "text" as const, text: JSON.stringify({ window: `${sinceHours}h`, total: recent.length, bySeverity, recent: recent.slice(0, 10) }, null, 2) }] };
    },
  );

  // --- Tool 4: close_investigation ---
  server.tool(
    "close_investigation",
    "Close an investigation with a verdict.",
    {
      id: z.string(),
      verdict: z.enum(["confirmed", "false-positive", "no-action", "escalated"]),
      notes: z.string().optional(),
    },
    async ({ id, verdict, notes }) => {
      const all = await getAll<Record<string, unknown>>(TABLE_INVESTIGATIONS, PARTITION_KEY);
      const inv = all.find((i) => i.id === id);
      if (!inv) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "not found" }) }], isError: true };
      const updated = { ...inv, status: "closed", verdict, notes: notes ?? null, closedAt: new Date().toISOString() };
      await upsertEntity(TABLE_INVESTIGATIONS, PARTITION_KEY, id, updated);
      await logActivity({
        agentId: "sentinel", surface: "purview", action: "investigation_closed",
        detail: { id, verdict },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(updated, null, 2) }] };
    },
  );

  // --- Tool 5: autonomous_tick ---
  server.tool(
    "autonomous_tick",
    "Open a synthetic investigation against a recent doc and apply a Confidential label, generating Purview activity.",
    { taskId: z.string().optional() },
    async ({ taskId }) => {
      const id = nfId("INV");
      const target = `AgentDrops/auto-sample-${Math.floor(Math.random() * 999)}.md`;
      const reason = ["Suspected sensitive content in body", "Routine compliance sweep", "Anomalous edit pattern"][Math.floor(Math.random() * 3)]!;
      const severity = ["low", "medium", "high"][Math.floor(Math.random() * 3)] as "low" | "medium" | "high";
      await upsertEntity(TABLE_INVESTIGATIONS, PARTITION_KEY, id, { id, target, reason, severity, status: "open", openedAt: new Date().toISOString(), taskId: taskId ?? null });
      await logActivity({
        taskId, agentId: "sentinel", surface: "purview", action: "auto_investigation",
        detail: { id, target, severity },
      });
      // also try to label it
      await postWebhook(process.env.PA_SP_LABEL_WEBHOOK, { fileName: target.split("/").pop(), folder: "AgentDrops", label: "Confidential" });
      return { content: [{ type: "text" as const, text: JSON.stringify({ id, target, severity }, null, 2) }] };
    },
  );

  await startServer(server, config);
}

main().catch(console.error);
