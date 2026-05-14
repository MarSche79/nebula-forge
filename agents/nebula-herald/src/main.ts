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
const TABLE_POSTS = "nfHeraldPosts";

const config: AgentConfig = {
  name: "Pulsar Herald",
  version: "1.0.0",
  description:
    "Teams broadcaster. Posts crew updates, status reports and (intentionally) Communication Compliance trigger phrases into the Nebula Forge agent Teams channel via a Power Automate flow running as the agentops service account.",
  port: 3011,
  instructions:
    "You are Pulsar Herald, the station's voice. Post natural-sounding chat updates. Some templates deliberately include CC-policy trigger phrases (offensive language, regulated discussions) so Purview Communication Compliance lights up.",
};

const CC_TRIGGERS = [
  "I swear if procurement screws this up again I'll lose my mind, this is a complete disaster.",
  "Don't tell HR but Vasquez has been completely useless on this project, total deadweight.",
  "Hey can you wire $4,000 from the ops account to my personal vendor — keep it off the books for now.",
  "Forward me the reactor coolant supplier's pricing PDF, I need it for a side deal with a competitor.",
  "If anyone from compliance asks, we never discussed bypassing the radiation shield interlock.",
];

const ROUTINE_POSTS = [
  "Morning shift handover — all systems green, nothing to flag.",
  "Sample bay 3 is now back online, materials team can resume processing.",
  "Reminder: emergency-egress drill at 14:30 station-time, please ack in this thread.",
  "Just published the Q3 mineral yield report to SharePoint, link in the channel files.",
  "Comms relay 02 is throttled today — expect 200ms extra latency on deep-space pings.",
];

async function main() {
  await ensureTable(TABLE_POSTS);
  const server = createMcpServer(config);

  // --- Tool 1: post_message ---
  server.tool(
    "post_message",
    "Post a Teams channel message via the Power Automate flow (runs as agentops service account, so it shows up as a real user post).",
    {
      message: z.string().describe("Message body"),
      subject: z.string().optional().describe("Optional subject line"),
      channel: z.string().default("General").describe("Teams channel display name"),
      taskId: z.string().optional(),
    },
    async ({ message, subject, channel, taskId }) => {
      const id = nfId("POST");
      const r = await postWebhook(process.env.PA_TEAMS_WEBHOOK, { channel, subject, message });
      await upsertEntity(TABLE_POSTS, PARTITION_KEY, id, { id, channel, subject, message, status: r.ok ? "sent" : "failed", createdAt: new Date().toISOString(), taskId: taskId ?? null });
      await logActivity({
        taskId, agentId: "herald", surface: "teams", action: r.ok ? "message_sent" : "message_failed",
        detail: { id, channel, subject, preview: message.slice(0, 80), status: r.status },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: r.ok, id, channel }, null, 2) }] };
    },
  );

  // --- Tool 2: trigger_cc_alert ---
  server.tool(
    "trigger_cc_alert",
    "Post a message containing a Purview Communication Compliance trigger phrase (offensive language / regulated language / financial misconduct). For demo use only.",
    {
      pattern: z
        .enum(["offensive", "harassment", "money-laundering", "leak", "compliance-bypass", "random"])
        .default("random")
        .describe("Which CC pattern to trigger"),
      channel: z.string().default("General"),
      taskId: z.string().optional(),
    },
    async ({ pattern, channel, taskId }) => {
      const idx = pattern === "random" ? Math.floor(Math.random() * CC_TRIGGERS.length)
        : { "offensive": 0, "harassment": 1, "money-laundering": 2, "leak": 3, "compliance-bypass": 4 }[pattern]!;
      const message = CC_TRIGGERS[idx]!;
      const id = nfId("CC");
      const r = await postWebhook(process.env.PA_CC_WEBHOOK, { channel, subject: "[demo trigger]", message });
      await upsertEntity(TABLE_POSTS, PARTITION_KEY, id, { id, channel, subject: "[demo trigger]", message, ccPattern: pattern, status: r.ok ? "sent" : "failed", createdAt: new Date().toISOString(), taskId: taskId ?? null });
      await logActivity({
        taskId, agentId: "herald", surface: "purview", action: r.ok ? "cc_trigger_posted" : "cc_trigger_failed",
        detail: { id, channel, pattern, preview: message.slice(0, 80), status: r.status },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: r.ok, id, pattern, message }, null, 2) }] };
    },
  );

  // --- Tool 3: list_recent_posts ---
  server.tool(
    "list_recent_posts",
    "List recent posts the Herald has made.",
    { limit: z.number().int().min(1).max(100).default(20) },
    async ({ limit }) => {
      const posts = await getAll<Record<string, unknown>>(TABLE_POSTS, PARTITION_KEY);
      posts.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
      return { content: [{ type: "text" as const, text: JSON.stringify({ total: posts.length, posts: posts.slice(0, limit) }, null, 2) }] };
    },
  );

  // --- Tool 4: schedule_broadcast ---
  server.tool(
    "schedule_broadcast",
    "Queue a broadcast to be sent at a future time. (Demo: stored locally; the cron tick can flush them.)",
    { message: z.string(), channel: z.string().default("General"), scheduledAt: z.string().describe("ISO timestamp") },
    async ({ message, channel, scheduledAt }) => {
      const id = nfId("SCHED");
      await upsertEntity(TABLE_POSTS, PARTITION_KEY, id, { id, channel, message, scheduledAt, status: "scheduled", createdAt: new Date().toISOString() });
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, id, scheduledAt }, null, 2) }] };
    },
  );

  // --- Tool 5: autonomous_tick ---
  server.tool(
    "autonomous_tick",
    "Pick a routine post and send it to Teams. Occasionally fires a CC trigger to keep Purview alerts flowing.",
    { taskId: z.string().optional() },
    async ({ taskId }) => {
      const fireCc = Math.random() < 0.25;
      if (fireCc) {
        const message = CC_TRIGGERS[Math.floor(Math.random() * CC_TRIGGERS.length)]!;
        const r = await postWebhook(process.env.PA_CC_WEBHOOK, { channel: "General", subject: "[demo trigger]", message });
        await logActivity({
          taskId, agentId: "herald", surface: "purview", action: r.ok ? "auto_cc_trigger_posted" : "auto_cc_trigger_failed",
          detail: { preview: message.slice(0, 80), status: r.status },
        });
        return { content: [{ type: "text" as const, text: JSON.stringify({ kind: "cc", ok: r.ok }) }] };
      }
      const message = ROUTINE_POSTS[Math.floor(Math.random() * ROUTINE_POSTS.length)]!;
      const r = await postWebhook(process.env.PA_TEAMS_WEBHOOK, { channel: "General", message });
      await logActivity({
        taskId, agentId: "herald", surface: "teams", action: r.ok ? "auto_message_sent" : "auto_message_failed",
        detail: { preview: message.slice(0, 80), status: r.status },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({ kind: "routine", ok: r.ok }) }] };
    },
  );

  await startServer(server, config);
}

main().catch(console.error);
