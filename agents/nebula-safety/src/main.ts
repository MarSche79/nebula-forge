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

const TABLE_INCIDENTS = "nfIncidents";
const TABLE_RADIATION = "nfRadiation";
const TABLE_PROTOCOLS = "nfProtocols";

const config: AgentConfig = {
  name: "Nebula Forge Safety Officer",
  version: "1.0.0",
  description:
    "Safety & compliance — incident reporting, radiation monitoring, safety audits, and emergency protocol management",
  port: 3005,
  instructions:
    "You are the Safety Officer AI for Nebula Forge station. Monitor safety conditions, manage incident reports, track radiation levels, and provide emergency protocol guidance. Crew safety is always the top priority.",
};

async function main() {
  // Ensure tables exist and seed data
  await ensureTable(TABLE_INCIDENTS);
  await ensureTable(TABLE_RADIATION);
  await ensureTable(TABLE_PROTOCOLS);
  await seed();

  const server = createMcpServer(config);

  // --- Tool 1: get_incidents ---
  server.tool(
    "get_incidents",
    "List safety incidents. Optionally filter by severity or status.",
    {
      severity: z
        .enum(["low", "medium", "high", "critical"])
        .optional()
        .describe("Filter incidents by severity level"),
      status: z
        .enum(["open", "investigating", "resolved", "closed"])
        .optional()
        .describe("Filter incidents by status"),
    },
    async ({ severity, status }) => {
      let incidents = await getAll<Record<string, unknown>>(TABLE_INCIDENTS, PARTITION_KEY);

      if (severity) {
        incidents = incidents.filter((i) => i.severity === severity);
      }
      if (status) {
        incidents = incidents.filter((i) => i.status === status);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total: incidents.length, incidents }, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool 2: report_incident ---
  server.tool(
    "report_incident",
    "Report a new safety incident. Creates a new incident record with an auto-generated ID and today's date.",
    {
      title: z.string().describe("Short title of the incident"),
      severity: z.enum(["low", "medium", "high", "critical"]).describe("Incident severity level"),
      location: z.string().describe("Location on the station where the incident occurred"),
      reportedBy: z.string().describe("Name and rank of the person reporting"),
      description: z.string().describe("Detailed description of the incident"),
    },
    async ({ title, severity, location, reportedBy, description }) => {
      const id = `INC-${Date.now().toString(36).toUpperCase()}`;

      const incident = {
        id,
        title,
        severity,
        location,
        reportedBy,
        reportedDate: new Date().toISOString().split("T")[0],
        status: "open",
        description,
      };

      await upsertEntity(TABLE_INCIDENTS, PARTITION_KEY, id, incident);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { message: `Incident reported — severity: ${severity}`, incident },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // --- Tool 3: check_radiation_levels ---
  server.tool(
    "check_radiation_levels",
    "Get current radiation readings across the station. Optionally filter by a specific sector ID to get a single reading.",
    {
      sectorId: z.string().optional().describe("Sector ID to check (e.g. SEC-CMD, SEC-ENG). Omit for all sectors."),
    },
    async ({ sectorId }) => {
      if (sectorId) {
        const reading = await getById<Record<string, unknown>>(TABLE_RADIATION, PARTITION_KEY, sectorId);
        if (!reading) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: `No radiation data found for sector: ${sectorId}` }, null, 2),
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ reading }, null, 2),
            },
          ],
        };
      }

      const readings = await getAll<Record<string, unknown>>(TABLE_RADIATION, PARTITION_KEY);
      const warnings = readings.filter(
        (r) => r.status === "warning" || r.status === "critical"
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                totalSectors: readings.length,
                alertCount: warnings.length,
                alerts: warnings.map((r) => ({
                  sectorId: r.sectorId,
                  sectorName: r.sectorName,
                  currentLevel: r.currentLevel,
                  safeThreshold: r.safeThreshold,
                  status: r.status,
                })),
                readings,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // --- Tool 4: run_safety_audit ---
  server.tool(
    "run_safety_audit",
    "Run a safety audit for a specific sector. Combines incident history and radiation data for the given area into an audit report.",
    {
      sectorId: z.string().describe("Sector ID to audit (e.g. SEC-CMD, SEC-ENG)"),
    },
    async ({ sectorId }) => {
      const readings = await getAll<Record<string, unknown>>(TABLE_RADIATION, PARTITION_KEY);
      const sectorReading = readings.find((r) => r.sectorId === sectorId);

      const incidents = await getAll<Record<string, unknown>>(TABLE_INCIDENTS, PARTITION_KEY);

      // Match incidents by checking if the sector name appears in the incident location
      const sectorName = sectorReading?.sectorName as string | undefined;
      const sectorIncidents = sectorName
        ? incidents.filter((i) => {
            const location = (i.location as string).toLowerCase();
            return location.includes(sectorName.toLowerCase()) || location.includes(sectorId.toLowerCase());
          })
        : [];

      const openIncidents = sectorIncidents.filter(
        (i) => i.status === "open" || i.status === "investigating"
      );

      const radiationStatus = sectorReading
        ? {
            sectorId: sectorReading.sectorId,
            sectorName: sectorReading.sectorName,
            currentLevel: sectorReading.currentLevel,
            unit: sectorReading.unit,
            safeThreshold: sectorReading.safeThreshold,
            status: sectorReading.status,
            withinSafeLimit:
              typeof sectorReading.currentLevel === "number" &&
              typeof sectorReading.safeThreshold === "number"
                ? sectorReading.currentLevel <= sectorReading.safeThreshold
                : null,
          }
        : null;

      const overallRisk =
        openIncidents.some((i) => i.severity === "critical")
          ? "critical"
          : openIncidents.some((i) => i.severity === "high") ||
              (sectorReading && sectorReading.status === "warning")
            ? "high"
            : openIncidents.length > 0 ||
                (sectorReading && sectorReading.status === "elevated")
              ? "medium"
              : "low";

      const audit = {
        auditDate: new Date().toISOString(),
        sectorId,
        sectorName: sectorName ?? "Unknown",
        overallRisk,
        radiation: radiationStatus ?? "No radiation data available for this sector",
        incidents: {
          total: sectorIncidents.length,
          open: openIncidents.length,
          items: sectorIncidents.map((i) => ({
            id: i.id,
            title: i.title,
            severity: i.severity,
            status: i.status,
            reportedDate: i.reportedDate,
          })),
        },
        recommendation:
          overallRisk === "critical"
            ? "IMMEDIATE ACTION REQUIRED — Restrict access and deploy response teams."
            : overallRisk === "high"
              ? "Elevated risk — Schedule priority inspection and increase monitoring frequency."
              : overallRisk === "medium"
                ? "Moderate risk — Continue monitoring and address open incidents promptly."
                : "Sector is within normal operating parameters.",
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(audit, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool 5: get_emergency_protocols ---
  server.tool(
    "get_emergency_protocols",
    "List emergency protocols. Optionally filter by severity level.",
    {
      severity: z
        .enum(["high", "critical"])
        .optional()
        .describe("Filter protocols by severity level"),
    },
    async ({ severity }) => {
      let protocols = await getAll<Record<string, unknown>>(TABLE_PROTOCOLS, PARTITION_KEY);

      if (severity) {
        protocols = protocols.filter((p) => p.severity === severity);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total: protocols.length, protocols }, null, 2),
          },
        ],
      };
    }
  );

  await maybeSeedOnStart(seed);
  await startServer(server, config);
}

main().catch(console.error);
