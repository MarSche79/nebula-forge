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
import type { RepairTask, StationSystem } from "@nebula-forge/shared";

const config: AgentConfig = {
  name: "Nebula Forge Chief Engineer",
  version: "1.0.0",
  description:
    "Engineering & maintenance — station systems monitoring, repair scheduling, diagnostics, and power grid management",
  port: 3006,
  instructions:
    "You are the Chief Engineer AI for Nebula Forge station. Monitor station systems, schedule repairs, run diagnostics, and manage the power grid. Prioritize critical systems and maintain station operational readiness.",
};

const PARTITION_KEY = "nebula-forge";
const SYSTEMS_TABLE = "nfSystems";
const REPAIRS_TABLE = "nfRepairs";
const POWER_GRID_TABLE = "nfPowerGrid";

interface PowerGridSector {
  id: string;
  sectorName: string;
  powerOutput: number;
  powerConsumption: number;
  efficiency: number;
  status: "optimal" | "nominal" | "strained" | "critical";
  connectedSystems: string[];
  lastMaintenance: string;
}

function parsePowerGridSector(raw: Record<string, unknown>): PowerGridSector {
  return {
    ...raw,
    connectedSystems:
      typeof raw.connectedSystems === "string"
        ? JSON.parse(raw.connectedSystems)
        : raw.connectedSystems,
  } as PowerGridSector;
}

async function main() {
  await ensureTable(SYSTEMS_TABLE);
  await ensureTable(REPAIRS_TABLE);
  await ensureTable(POWER_GRID_TABLE);

  const server = createMcpServer(config);

  // --- Tool 1: get_system_status ---
  server.tool(
    "get_system_status",
    "Get status of all station systems or a specific system by ID.",
    {
      systemId: z
        .string()
        .optional()
        .describe("Optional system ID (e.g. SYS-001) to get a specific system"),
    },
    async ({ systemId }) => {
      if (systemId) {
        const system = await getById<StationSystem>(
          SYSTEMS_TABLE,
          PARTITION_KEY,
          systemId
        );
        if (!system) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: System "${systemId}" not found.`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(system, null, 2),
            },
          ],
        };
      }

      const systems = await getAll<StationSystem>(SYSTEMS_TABLE, PARTITION_KEY);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(systems, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool 2: schedule_repair ---
  server.tool(
    "schedule_repair",
    "Schedule a new repair task for a station system.",
    {
      system: z.string().describe("Name of the system requiring repair"),
      subsystem: z.string().describe("Specific subsystem or component"),
      priority: z
        .enum(["low", "medium", "high", "emergency"])
        .describe("Repair priority level"),
      assignedTo: z.string().describe("Name of the engineer or technician assigned"),
      scheduledDate: z
        .string()
        .describe("Scheduled repair date (YYYY-MM-DD)"),
      description: z.string().describe("Detailed description of the repair needed"),
    },
    async ({ system, subsystem, priority, assignedTo, scheduledDate, description }) => {
      const existing = await getAll<Record<string, unknown>>(
        REPAIRS_TABLE,
        PARTITION_KEY
      );
      const nextNum = existing.length + 1;
      const id = `RPR-${String(nextNum).padStart(3, "0")}`;

      const repair: RepairTask = {
        id,
        system,
        subsystem,
        priority,
        status: "scheduled",
        assignedTo,
        scheduledDate,
        description,
      };

      await upsertEntity(REPAIRS_TABLE, PARTITION_KEY, id, repair as unknown as Record<string, unknown>);

      return {
        content: [
          {
            type: "text" as const,
            text: `Repair task created successfully:\n${JSON.stringify(repair, null, 2)}`,
          },
        ],
      };
    }
  );

  // --- Tool 3: get_repairs ---
  server.tool(
    "get_repairs",
    "List all repair tasks. Optionally filter by status or priority.",
    {
      status: z
        .enum(["scheduled", "in-progress", "completed", "deferred"])
        .optional()
        .describe("Filter repairs by status"),
      priority: z
        .enum(["low", "medium", "high", "emergency"])
        .optional()
        .describe("Filter repairs by priority"),
    },
    async ({ status, priority }) => {
      const repairs = await getAll<RepairTask>(REPAIRS_TABLE, PARTITION_KEY);
      let filtered = repairs;

      if (status) filtered = filtered.filter((r) => r.status === status);
      if (priority) filtered = filtered.filter((r) => r.priority === priority);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(filtered, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool 4: run_diagnostics ---
  server.tool(
    "run_diagnostics",
    "Run diagnostics on a station system. Returns a health report with detected issues.",
    {
      systemId: z.string().describe("System ID to run diagnostics on (e.g. SYS-001)"),
    },
    async ({ systemId }) => {
      const system = await getById<StationSystem>(
        SYSTEMS_TABLE,
        PARTITION_KEY,
        systemId
      );

      if (!system) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: System "${systemId}" not found.`,
            },
          ],
          isError: true,
        };
      }

      const health = system.healthPercent;
      const issues: string[] = [];
      const recommendations: string[] = [];

      if (health < 50) {
        issues.push("⚠ CRITICAL: System health below 50% — immediate maintenance required");
        recommendations.push("Take system offline for emergency repairs");
        recommendations.push("Activate backup systems if available");
      } else if (health < 70) {
        issues.push("⚠ WARNING: System health degraded — performance impact likely");
        issues.push("Component wear detected in primary subsystems");
        recommendations.push("Schedule priority maintenance within 48 hours");
        recommendations.push("Monitor for further degradation");
      } else if (health < 85) {
        issues.push("Minor wear detected on secondary components");
        recommendations.push("Schedule routine maintenance at next available window");
      }

      if (system.status === "degraded") {
        issues.push("System operating in degraded mode — reduced throughput");
        recommendations.push("Inspect degraded subsystems and replace faulty components");
      }

      if (system.status === "maintenance") {
        issues.push("System currently under maintenance — limited availability");
        recommendations.push("Verify maintenance progress and estimated completion time");
      }

      if (system.status === "offline") {
        issues.push("⚠ CRITICAL: System is offline");
        recommendations.push("Identify root cause of failure and initiate emergency repair");
      }

      if (issues.length === 0) {
        issues.push("No issues detected — all subsystems nominal");
        recommendations.push("Continue standard inspection schedule");
      }

      const report = {
        systemId: system.id,
        systemName: system.name,
        category: system.category,
        currentStatus: system.status,
        healthPercent: health,
        diagnosticResult: health >= 85 ? "PASS" : health >= 70 ? "WARNING" : "FAIL",
        issuesDetected: issues,
        recommendations,
        lastInspection: system.lastInspection,
        nextInspection: system.nextInspection,
        reportTimestamp: new Date().toISOString(),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(report, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool 5: get_power_grid_status ---
  server.tool(
    "get_power_grid_status",
    "Get power grid overview. Returns all sectors with output, consumption, efficiency, and status.",
    {},
    async () => {
      const raw = await getAll<Record<string, unknown>>(
        POWER_GRID_TABLE,
        PARTITION_KEY
      );
      const sectors = raw.map(parsePowerGridSector);

      const totalOutput = sectors.reduce((sum, s) => sum + s.powerOutput, 0);
      const totalConsumption = sectors.reduce(
        (sum, s) => sum + s.powerConsumption,
        0
      );
      const overallEfficiency =
        totalOutput > 0
          ? Math.round((totalConsumption / totalOutput) * 100 * 100) / 100
          : 0;

      const criticalSectors = sectors.filter((s) => s.status === "critical");
      const strainedSectors = sectors.filter((s) => s.status === "strained");

      const summary = {
        totalSectors: sectors.length,
        totalPowerOutputMW: totalOutput,
        totalPowerConsumptionMW: totalConsumption,
        surplusMW: totalOutput - totalConsumption,
        overallLoadPercent: overallEfficiency,
        criticalSectors: criticalSectors.length,
        strainedSectors: strainedSectors.length,
        alerts: [
          ...criticalSectors.map(
            (s) => `⚠ CRITICAL: ${s.sectorName} — efficiency at ${s.efficiency}%, last maintained ${s.lastMaintenance}`
          ),
          ...strainedSectors.map(
            (s) => `⚡ STRAINED: ${s.sectorName} — efficiency at ${s.efficiency}%`
          ),
        ],
        sectors,
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

  await maybeSeedOnStart(seed);
  await startServer(server, config);
}

main().catch(console.error);
