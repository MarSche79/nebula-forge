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

const TABLE_RECORDS = "nfMedicalRecords";
const TABLE_MEDICATIONS = "nfMedications";
const TABLE_CHECKUPS = "nfCheckupSchedule";

const config: AgentConfig = {
  name: "Nebula Forge Medical Officer",
  version: "1.0.0",
  description:
    "Medical bay operations — crew health monitoring, checkup scheduling, medical records, and medication inventory",
  port: 3009,
  instructions:
    "You are the Medical Officer AI for Nebula Forge station. Manage crew health records, schedule medical checkups, track medication inventory, and handle medical incident reports. Patient confidentiality is paramount — only share records with authorized personnel.",
};

async function main() {
  await ensureTable(TABLE_RECORDS);
  await ensureTable(TABLE_MEDICATIONS);
  await ensureTable(TABLE_CHECKUPS);

  const server = createMcpServer(config);

  // --- Tool 1: get_crew_health ---
  server.tool(
    "get_crew_health",
    "Get a crew member's health summary including medical history and upcoming checkups. If no crewMemberId is provided, returns a summary for all crew members.",
    { crewMemberId: z.string().optional().describe("Crew member ID (e.g. CREW-001)") },
    async ({ crewMemberId }) => {
      const records = await getAll<Record<string, unknown>>(TABLE_RECORDS, PARTITION_KEY);
      const checkups = await getAll<Record<string, unknown>>(TABLE_CHECKUPS, PARTITION_KEY);

      let filteredRecords = records;
      let filteredCheckups = checkups;

      if (crewMemberId) {
        filteredRecords = records.filter((r) => r.crewMemberId === crewMemberId);
        filteredCheckups = checkups.filter((c) => c.crewMemberId === crewMemberId);
      }

      const upcomingCheckups = filteredCheckups.filter(
        (c) => c.status === "scheduled" || c.status === "rescheduled"
      );

      const summary = {
        crewMemberId: crewMemberId ?? "all",
        totalRecords: filteredRecords.length,
        medicalHistory: filteredRecords.map((r) => ({
          id: r.id,
          type: r.type,
          date: r.date,
          physician: r.physician,
          diagnosis: r.diagnosis,
          status: r.status,
        })),
        upcomingCheckups: upcomingCheckups.map((c) => ({
          id: c.id,
          type: c.type,
          scheduledDate: c.scheduledDate,
          physician: c.physician,
          notes: c.notes,
          status: c.status,
        })),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
      };
    }
  );

  // --- Tool 2: schedule_checkup ---
  server.tool(
    "schedule_checkup",
    "Schedule a medical checkup for a crew member.",
    {
      crewMemberId: z.string().describe("Crew member ID (e.g. CREW-001)"),
      crewMemberName: z.string().describe("Crew member full name"),
      type: z.string().describe("Checkup type (e.g. quarterly-physical, psychological-followup, radiation-screening)"),
      scheduledDate: z.string().describe("Scheduled date (YYYY-MM-DD)"),
      physician: z.string().describe("Attending physician name"),
    },
    async ({ crewMemberId, crewMemberName, type, scheduledDate, physician }) => {
      const id = `CHK-${Date.now().toString(36).toUpperCase()}`;

      const checkup = {
        id,
        crewMemberId,
        crewMemberName,
        type,
        scheduledDate,
        physician,
        notes: "",
        status: "scheduled",
      };

      await upsertEntity(TABLE_CHECKUPS, PARTITION_KEY, id, checkup);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { message: "Checkup scheduled successfully", checkup },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // --- Tool 3: get_medical_records ---
  server.tool(
    "get_medical_records",
    "Retrieve medical records. Optionally filter by crew member ID or record type.",
    {
      crewMemberId: z.string().optional().describe("Filter by crew member ID"),
      type: z
        .enum(["checkup", "treatment", "emergency", "vaccination", "psychological"])
        .optional()
        .describe("Filter by record type"),
    },
    async ({ crewMemberId, type }) => {
      let records = await getAll<Record<string, unknown>>(TABLE_RECORDS, PARTITION_KEY);

      if (crewMemberId) {
        records = records.filter((r) => r.crewMemberId === crewMemberId);
      }
      if (type) {
        records = records.filter((r) => r.type === type);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total: records.length, records }, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool 4: report_medical_incident ---
  server.tool(
    "report_medical_incident",
    "Report an urgent medical incident for a crew member. Creates an emergency medical record.",
    {
      crewMemberId: z.string().describe("Crew member ID"),
      crewMemberName: z.string().describe("Crew member full name"),
      description: z.string().describe("Description of the medical incident"),
      severity: z.enum(["low", "medium", "high", "critical"]).describe("Incident severity"),
      physician: z.string().describe("Responding physician"),
    },
    async ({ crewMemberId, crewMemberName, description, severity, physician }) => {
      const id = `MED-E-${Date.now().toString(36).toUpperCase()}`;

      const record = {
        id,
        crewMemberId,
        crewMemberName,
        type: "emergency",
        date: new Date().toISOString().split("T")[0],
        physician,
        diagnosis: description,
        treatment: "Pending assessment",
        status: "follow-up-required",
        notes: `URGENT — Severity: ${severity}. Immediate medical attention required.`,
      };

      await upsertEntity(TABLE_RECORDS, PARTITION_KEY, id, record);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                message: `Medical incident reported — severity: ${severity}`,
                record,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // --- Tool 5: get_medication_inventory ---
  server.tool(
    "get_medication_inventory",
    "Get current medication inventory. Optionally filter by category. Flags items below minimum stock levels.",
    {
      category: z
        .enum(["antibiotic", "analgesic", "radiation", "psychological", "surgical", "nutritional"])
        .optional()
        .describe("Filter by medication category"),
    },
    async ({ category }) => {
      let medications = await getAll<Record<string, unknown>>(TABLE_MEDICATIONS, PARTITION_KEY);

      if (category) {
        medications = medications.filter((m) => m.category === category);
      }

      const inventory = medications.map((m) => ({
        id: m.id,
        name: m.name,
        category: m.category,
        quantity: m.quantity,
        unit: m.unit,
        minimumStock: m.minimumStock,
        belowMinimum:
          typeof m.quantity === "number" && typeof m.minimumStock === "number"
            ? m.quantity < m.minimumStock
            : false,
        expiryDate: m.expiryDate,
        storageRequirements: m.storageRequirements,
        manufacturer: m.manufacturer,
      }));

      const lowStockItems = inventory.filter((m) => m.belowMinimum);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total: inventory.length,
                lowStockAlerts: lowStockItems.length,
                lowStockItems: lowStockItems.map((m) => ({
                  name: m.name,
                  quantity: m.quantity,
                  minimumStock: m.minimumStock,
                })),
                inventory,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  await maybeSeedOnStart(seed);
  await startServer(server, config);
}

main().catch(console.error);
