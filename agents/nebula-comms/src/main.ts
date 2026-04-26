import { z } from "zod";
import {
  createMcpServer,
  startServer,
  AgentConfig,
  ensureTable,
  getAll,
  getById,
  upsertEntity,
  maybeSeedOnStart,
} from "@nebula-forge/shared";
import { seed } from "./seed.js";

const PARTITION_KEY = "nebula-forge";

const TABLE_MESSAGES = "nfMessages";
const TABLE_RELAYS = "nfRelays";
const TABLE_TRANSMISSIONS = "nfTransmissions";

const config: AgentConfig = {
  name: "Nebula Forge Comms Officer",
  version: "1.0.0",
  description:
    "Communications — signal relay management, crew messaging, deep-space transmissions, and communication logs",
  port: 3008,
  instructions:
    "You are the Communications Officer AI for Nebula Forge station. Manage station communications, monitor relay status, handle message routing, and schedule deep-space transmissions. Prioritize emergency communications.",
};

async function main() {
  await ensureTable(TABLE_MESSAGES);
  await ensureTable(TABLE_RELAYS);
  await ensureTable(TABLE_TRANSMISSIONS);

  const server = createMcpServer(config);

  // --- Tool 1: get_messages ---
  server.tool(
    "get_messages",
    "List communication messages. Optionally filter by channel or priority.",
    {
      channel: z
        .enum(["internal", "deep-space", "emergency", "command"])
        .optional()
        .describe("Filter by communication channel"),
      priority: z
        .enum(["routine", "priority", "urgent", "flash"])
        .optional()
        .describe("Filter by message priority"),
    },
    async ({ channel, priority }) => {
      let messages = await getAll<Record<string, unknown>>(TABLE_MESSAGES, PARTITION_KEY);

      if (channel) {
        messages = messages.filter((m) => m.channel === channel);
      }
      if (priority) {
        messages = messages.filter((m) => m.priority === priority);
      }

      // Sort by timestamp descending (most recent first)
      messages.sort((a, b) =>
        String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? ""))
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total: messages.length, messages }, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool 2: send_broadcast ---
  server.tool(
    "send_broadcast",
    "Send a station-wide broadcast message to all personnel. Creates a message with channel 'internal' and addressed to ALL-STATION.",
    {
      from: z.string().describe("Sender name or role (e.g. 'Cdr. Elena Vasquez')"),
      subject: z.string().describe("Broadcast subject line"),
      body: z.string().describe("Broadcast message body"),
      priority: z
        .enum(["routine", "priority", "urgent", "flash"])
        .describe("Message priority level"),
    },
    async ({ from, subject, body, priority }) => {
      const id = `MSG-${Date.now().toString(36).toUpperCase()}`;

      const message = {
        id,
        from,
        to: "ALL-STATION",
        channel: "internal",
        priority,
        timestamp: new Date().toISOString(),
        subject,
        body,
        status: "sent",
      };

      await upsertEntity(TABLE_MESSAGES, PARTITION_KEY, id, message);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { message: "Broadcast sent successfully", broadcast: message },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // --- Tool 3: check_signal_status ---
  server.tool(
    "check_signal_status",
    "Check the status of communication relay stations. Provide a relayId for a specific relay, or omit to get the status of all relays.",
    {
      relayId: z.string().optional().describe("Relay ID (e.g. RELAY-001) for a specific relay"),
    },
    async ({ relayId }) => {
      if (relayId) {
        const relay = await getById<Record<string, unknown>>(
          TABLE_RELAYS,
          PARTITION_KEY,
          relayId
        );
        if (!relay) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: `Relay '${relayId}' not found` }, null, 2),
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ relay }, null, 2),
            },
          ],
        };
      }

      const relays = await getAll<Record<string, unknown>>(TABLE_RELAYS, PARTITION_KEY);

      const summary = {
        totalRelays: relays.length,
        online: relays.filter((r) => r.status === "online").length,
        degraded: relays.filter((r) => r.status === "degraded").length,
        offline: relays.filter((r) => r.status === "offline").length,
        maintenance: relays.filter((r) => r.status === "maintenance").length,
        relays: relays.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          status: r.status,
          signalStrength: r.signalStrength,
          range: r.range,
          lastPing: r.lastPing,
        })),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool 4: schedule_transmission ---
  server.tool(
    "schedule_transmission",
    "Schedule a deep-space transmission. Automatically calculates the relay path based on available online relays.",
    {
      targetStation: z.string().describe("Name of the target station or outpost"),
      message: z.string().describe("Transmission message content"),
      scheduledTime: z.string().describe("Scheduled transmission time (ISO 8601 format)"),
      priority: z
        .enum(["routine", "priority", "urgent", "flash"])
        .describe("Transmission priority level"),
    },
    async ({ targetStation, message, scheduledTime, priority }) => {
      const id = `TX-${Date.now().toString(36).toUpperCase()}`;

      // Calculate relay path from available online relays
      const relays = await getAll<Record<string, unknown>>(TABLE_RELAYS, PARTITION_KEY);
      const onlineRelays = relays
        .filter((r) => r.status === "online")
        .sort((a, b) => Number(b.signalStrength ?? 0) - Number(a.signalStrength ?? 0));

      const relayPath = onlineRelays.slice(0, 2).map((r) => r.id as string);

      const windowDuration = priority === "flash" ? 15 : priority === "urgent" ? 30 : 45;

      const transmission = {
        id,
        targetStation,
        message,
        scheduledTime,
        windowDuration,
        relayPath: JSON.stringify(relayPath),
        status: "queued",
        priority,
      };

      await upsertEntity(TABLE_TRANSMISSIONS, PARTITION_KEY, id, transmission);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                message: "Transmission scheduled successfully",
                transmission: { ...transmission, relayPath },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // --- Tool 5: get_comm_logs ---
  server.tool(
    "get_comm_logs",
    "Get communication logs. Optionally filter by date range or channel.",
    {
      startDate: z
        .string()
        .optional()
        .describe("Start date for filtering (ISO 8601 format, e.g. 2287-03-15)"),
      endDate: z
        .string()
        .optional()
        .describe("End date for filtering (ISO 8601 format, e.g. 2287-03-16)"),
      channel: z
        .enum(["internal", "deep-space", "emergency", "command"])
        .optional()
        .describe("Filter by communication channel"),
    },
    async ({ startDate, endDate, channel }) => {
      let messages = await getAll<Record<string, unknown>>(TABLE_MESSAGES, PARTITION_KEY);
      const transmissions = await getAll<Record<string, unknown>>(
        TABLE_TRANSMISSIONS,
        PARTITION_KEY
      );

      if (channel) {
        messages = messages.filter((m) => m.channel === channel);
      }

      if (startDate) {
        const start = new Date(startDate).getTime();
        messages = messages.filter(
          (m) => new Date(String(m.timestamp)).getTime() >= start
        );
      }
      if (endDate) {
        const end = new Date(endDate).getTime();
        messages = messages.filter(
          (m) => new Date(String(m.timestamp)).getTime() <= end
        );
      }

      // Sort by timestamp descending
      messages.sort((a, b) =>
        String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? ""))
      );

      const logs = {
        totalMessages: messages.length,
        totalTransmissions: transmissions.length,
        messages: messages.map((m) => ({
          id: m.id,
          from: m.from,
          to: m.to,
          channel: m.channel,
          priority: m.priority,
          timestamp: m.timestamp,
          subject: m.subject,
          status: m.status,
        })),
        transmissions: transmissions.map((t) => ({
          id: t.id,
          targetStation: t.targetStation,
          scheduledTime: t.scheduledTime,
          status: t.status,
          priority: t.priority,
        })),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(logs, null, 2),
          },
        ],
      };
    }
  );

  await maybeSeedOnStart(seed);
  await startServer(server, config);
}

main().catch(console.error);
