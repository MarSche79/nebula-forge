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
const TABLE_DOCS = "nfScribeDocs";

const config: AgentConfig = {
  name: "Nebula Scribe",
  version: "1.0.0",
  description:
    "Document author & SharePoint publisher. Drafts mission reports, geology surveys, HR memos and incident write-ups, then publishes them to the Nebula Forge agent SharePoint site via a Power Automate flow.",
  port: 3010,
  instructions:
    "You are Nebula Scribe, the station's official scribe. Produce well-structured Markdown / plaintext documents and publish them to SharePoint. Some doc templates intentionally include sensitive demo data (credit cards, fake SSNs) so DLP policies fire.",
};

// --- DLP-trigger payload templates (intentional sensitive content) ---
const SENSITIVE_FRAGMENTS: Record<string, string> = {
  "billing-recon":
    "## Off-station billing reconciliation\n\nVendor card on file: **Visa 4111-1111-1111-1111**, exp 11/29, CVV 737.\nBackup card: **MasterCard 5500 0000 0000 0004**.\nContact AP: ap@nebula-forge.station.",
  "crew-id-dump":
    "## Crew ID export — DO NOT REDISTRIBUTE\n\n| Crew | SSN | Passport |\n|---|---|---|\n| Vasquez E. | 123-45-6789 | A12345678 |\n| Rourke T.  | 987-65-4321 | B98765432 |\n",
  "infra-keys":
    "## Station infra rotation log\n\nLegacy NebulaForge API key: `nf_live_4f8a9b1c2d3e4f5a6b7c8d9e0f1a2b3c`.\nReactor diagnostic token: `eyJhbGciOiJIUzI1NiJ9.demo-payload.demo-sig`.\n",
};

async function main() {
  await ensureTable(TABLE_DOCS);
  const server = createMcpServer(config);

  // --- Tool 1: draft_doc ---
  server.tool(
    "draft_doc",
    "Draft a document body (Markdown). Returns the draft text and a generated document ID. Optionally includes a sensitive content template that will trigger Purview DLP when published.",
    {
      title: z.string().describe("Document title"),
      kind: z
        .enum(["mission-report", "geology-survey", "hr-memo", "incident", "billing-recon", "crew-id-dump", "infra-keys"])
        .describe("Template to use. The last three intentionally contain DLP-sensitive demo content."),
      summary: z.string().optional().describe("Optional 1-2 sentence summary to include"),
      taskId: z.string().optional().describe("Kanban task ID for activity correlation"),
    },
    async ({ title, kind, summary, taskId }) => {
      const id = nfId("DOC");
      const sensitive = SENSITIVE_FRAGMENTS[kind] ?? "";
      const body = [
        `# ${title}`,
        ``,
        `_Filed by Nebula Scribe — ${new Date().toISOString()}_`,
        summary ? `\n${summary}\n` : "",
        sensitive,
        sensitive ? "" : `## Findings\nRoutine ${kind} entry.\n`,
      ].filter(Boolean).join("\n");

      const doc = { id, title, kind, body, status: "drafted", createdAt: new Date().toISOString(), taskId: taskId ?? null };
      await upsertEntity(TABLE_DOCS, PARTITION_KEY, id, doc);

      await logActivity({
        taskId, agentId: "scribe", surface: "system", action: "doc_drafted",
        detail: { id, title, kind, sensitive: !!sensitive },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({ id, title, body, sensitive: !!sensitive }, null, 2) }] };
    },
  );

  // --- Tool 2: publish_to_sharepoint ---
  server.tool(
    "publish_to_sharepoint",
    "Publish a previously drafted (or supplied inline) document to SharePoint via the Power Automate webhook. The flow runs as the agentops service account so it appears as a real crew member edit.",
    {
      docId: z.string().optional().describe("ID of a previously drafted doc"),
      title: z.string().optional().describe("Title (required if docId not given)"),
      body: z.string().optional().describe("Body markdown (required if docId not given)"),
      folder: z.string().default("AgentDrops").describe("SharePoint folder under Shared Documents"),
      taskId: z.string().optional(),
    },
    async ({ docId, title, body, folder, taskId }) => {
      let resolvedTitle = title ?? "";
      let resolvedBody = body ?? "";
      if (docId) {
        const all = await getAll<Record<string, unknown>>(TABLE_DOCS, PARTITION_KEY);
        const found = all.find((d) => d.id === docId);
        if (found) {
          resolvedTitle = String(found.title ?? resolvedTitle);
          resolvedBody = String(found.body ?? resolvedBody);
        }
      }
      if (!resolvedTitle || !resolvedBody) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "title+body or docId required" }) }], isError: true };
      }

      const fileName = `${resolvedTitle.replace(/[^A-Za-z0-9_-]+/g, "_")}-${Date.now()}.md`;
      const r = await postWebhook(process.env.PA_SP_CREATE_WEBHOOK, {
        folder, fileName, content: resolvedBody, contentType: "text/markdown", title: resolvedTitle,
      });

      await logActivity({
        taskId, agentId: "scribe", surface: "sharepoint", action: r.ok ? "doc_published" : "doc_publish_failed",
        detail: { fileName, folder, status: r.status }, externalUrl: undefined,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: r.ok, fileName, folder, webhookStatus: r.status }, null, 2) }] };
    },
  );

  // --- Tool 3: list_recent_docs ---
  server.tool(
    "list_recent_docs",
    "List the most recent documents drafted/published by the Scribe.",
    { limit: z.number().int().min(1).max(50).default(10) },
    async ({ limit }) => {
      const docs = await getAll<Record<string, unknown>>(TABLE_DOCS, PARTITION_KEY);
      docs.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
      return { content: [{ type: "text" as const, text: JSON.stringify({ total: docs.length, docs: docs.slice(0, limit) }, null, 2) }] };
    },
  );

  // --- Tool 4: apply_label ---
  server.tool(
    "apply_label",
    "Apply or change the Purview sensitivity label of a published doc via the Power Automate label flow.",
    {
      fileName: z.string(),
      folder: z.string().default("AgentDrops"),
      label: z.enum(["Public", "Internal", "Confidential", "HighlyConfidential"]),
      taskId: z.string().optional(),
    },
    async ({ fileName, folder, label, taskId }) => {
      const r = await postWebhook(process.env.PA_SP_LABEL_WEBHOOK, { fileName, folder, label });
      await logActivity({
        taskId, agentId: "scribe", surface: "purview", action: "label_applied",
        detail: { fileName, folder, label, status: r.status },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: r.ok, label, fileName }, null, 2) }] };
    },
  );

  // --- Tool 5: autonomous_tick ---
  server.tool(
    "autonomous_tick",
    "Pick a random doc template, draft it, and publish to SharePoint. Used by the cron job for baseline activity.",
    { taskId: z.string().optional() },
    async ({ taskId }) => {
      const kinds = ["mission-report", "geology-survey", "hr-memo", "incident", "billing-recon"] as const;
      const pick = kinds[Math.floor(Math.random() * kinds.length)]!;
      const id = nfId("DOC");
      const sensitive = SENSITIVE_FRAGMENTS[pick] ?? "";
      const title = `${pick.replace(/-/g, " ")} — auto ${new Date().toISOString().slice(0, 10)}`;
      const body = `# ${title}\n\n_Auto-drafted by Nebula Scribe._\n\n${sensitive || `Routine ${pick} entry.`}\n`;
      await upsertEntity(TABLE_DOCS, PARTITION_KEY, id, { id, title, kind: pick, body, status: "auto", createdAt: new Date().toISOString(), taskId: taskId ?? null });

      const fileName = `${title.replace(/[^A-Za-z0-9_-]+/g, "_")}.md`;
      const r = await postWebhook(process.env.PA_SP_CREATE_WEBHOOK, {
        folder: "AgentDrops", fileName, content: body, contentType: "text/markdown", title,
      });
      await logActivity({
        taskId, agentId: "scribe", surface: "sharepoint", action: r.ok ? "auto_doc_published" : "auto_doc_publish_failed",
        detail: { id, fileName, kind: pick, sensitive: !!sensitive, status: r.status },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: r.ok, id, fileName, kind: pick }, null, 2) }] };
    },
  );

  await startServer(server, config);
}

main().catch(console.error);
