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

const config: AgentConfig = {
  name: "Nebula Forge HR Assistant",
  version: "1.0.0",
  description:
    "HR & Personnel management for Nebula Forge station — crew screening, onboarding, roster management, and leave processing",
  port: 3001,
  instructions:
    "You are the HR Assistant for Nebula Forge space station. Help personnel managers with crew screening, onboarding, roster queries, and leave management. Always be professional and thorough in your assessments.",
};

const PARTITION_KEY = "nebula-forge";
const CREW_TABLE = "nfCrew";
const CANDIDATES_TABLE = "nfCandidates";
const LEAVE_TABLE = "nfLeaveRequests";

interface Candidate {
  id: string;
  name: string;
  appliedPosition: string;
  department: string;
  experience: number;
  skills: string[];
  educationLevel: string;
  psyEvalScore: number;
  physicalFitnessScore: number;
  status: "pending" | "screening" | "approved" | "rejected";
  applicationDate: string;
}

interface LeaveRequest {
  id: string;
  crewMemberId: string;
  crewMemberName: string;
  type: "shore-leave" | "medical" | "personal" | "training";
  startDate: string;
  endDate: string;
  status: "pending" | "approved" | "denied";
  reason: string;
}

interface CrewMember {
  id: string;
  name: string;
  rank: string;
  department: string;
  specialization: string;
  status: "active" | "on-leave" | "medical" | "off-station";
  joinDate: string;
  clearanceLevel: number;
}

function parseCandidate(raw: Record<string, unknown>): Candidate {
  return {
    ...raw,
    skills:
      typeof raw.skills === "string" ? JSON.parse(raw.skills) : raw.skills,
  } as Candidate;
}

async function main() {
  await ensureTable(CREW_TABLE);
  await ensureTable(CANDIDATES_TABLE);
  await ensureTable(LEAVE_TABLE);

  const server = createMcpServer(config);

  // --- Tool 1: get_crew_roster ---
  server.tool(
    "get_crew_roster",
    "List all crew members on the station roster. Optionally filter by department or status.",
    {
      department: z
        .enum([
          "Command",
          "Engineering",
          "Science",
          "Medical",
          "Security",
          "Operations",
        ])
        .optional()
        .describe("Filter crew by department"),
      status: z
        .enum(["active", "on-leave", "medical", "off-station"])
        .optional()
        .describe("Filter crew by current status"),
    },
    async ({ department, status }) => {
      const raw = await getAll<Record<string, unknown>>(
        CREW_TABLE,
        PARTITION_KEY
      );
      let crew = raw as unknown as CrewMember[];

      if (department) crew = crew.filter((c) => c.department === department);
      if (status) crew = crew.filter((c) => c.status === status);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { total: crew.length, crew },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // --- Tool 2: get_crew_profile ---
  server.tool(
    "get_crew_profile",
    "Get the detailed profile of a specific crew member by their ID.",
    {
      crewId: z.string().describe("Crew member ID (e.g. CREW-001)"),
    },
    async ({ crewId }) => {
      const member = await getById<CrewMember>(
        CREW_TABLE,
        PARTITION_KEY,
        crewId
      );

      if (!member) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Crew member "${crewId}" not found.`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(member, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool 3: screen_candidate ---
  server.tool(
    "screen_candidate",
    "Screen a candidate applying for a position. Returns candidate data with an AI-friendly assessment summary evaluating qualifications against station requirements.",
    {
      candidateId: z
        .string()
        .describe("Candidate ID (e.g. CAND-001)"),
    },
    async ({ candidateId }) => {
      const raw = await getById<Record<string, unknown>>(
        CANDIDATES_TABLE,
        PARTITION_KEY,
        candidateId
      );

      if (!raw) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Candidate "${candidateId}" not found.`,
            },
          ],
          isError: true,
        };
      }

      const candidate = parseCandidate(raw);

      const PSY_THRESHOLD = 70;
      const PHYSICAL_THRESHOLD = 60;

      const psyPass = candidate.psyEvalScore >= PSY_THRESHOLD;
      const physicalPass =
        candidate.physicalFitnessScore >= PHYSICAL_THRESHOLD;
      const overallRecommendation =
        psyPass && physicalPass ? "RECOMMENDED" : "FLAGGED FOR REVIEW";

      const flags: string[] = [];
      if (!psyPass)
        flags.push(
          `Psychological evaluation score (${candidate.psyEvalScore}) is below the threshold of ${PSY_THRESHOLD}`
        );
      if (!physicalPass)
        flags.push(
          `Physical fitness score (${candidate.physicalFitnessScore}) is below the threshold of ${PHYSICAL_THRESHOLD}`
        );

      const assessment = {
        candidate,
        screening: {
          psyEvalThreshold: PSY_THRESHOLD,
          psyEvalPassed: psyPass,
          physicalFitnessThreshold: PHYSICAL_THRESHOLD,
          physicalFitnessPassed: physicalPass,
          overallRecommendation,
          flags: flags.length > 0 ? flags : ["No issues detected"],
          experienceSummary: `${candidate.experience} years of relevant experience`,
          skillCount: candidate.skills.length,
        },
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(assessment, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool 4: process_leave_request ---
  server.tool(
    "process_leave_request",
    "Approve or deny a pending leave request. Updates the leave request status in the system.",
    {
      requestId: z.string().describe("Leave request ID (e.g. LR-001)"),
      decision: z
        .enum(["approved", "denied"])
        .describe("Decision on the leave request"),
      reason: z
        .string()
        .optional()
        .describe("Optional reason for the decision"),
    },
    async ({ requestId, decision, reason }) => {
      const raw = await getById<Record<string, unknown>>(
        LEAVE_TABLE,
        PARTITION_KEY,
        requestId
      );

      if (!raw) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Leave request "${requestId}" not found.`,
            },
          ],
          isError: true,
        };
      }

      const request = raw as unknown as LeaveRequest;
      const previousStatus = request.status;
      request.status = decision;

      const updatedData: Record<string, unknown> = { ...request };
      if (reason) {
        updatedData.decisionReason = reason;
      }

      await upsertEntity(LEAVE_TABLE, PARTITION_KEY, requestId, updatedData);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                message: `Leave request ${requestId} has been ${decision}`,
                previousStatus,
                newStatus: decision,
                crewMember: request.crewMemberName,
                leaveType: request.type,
                period: `${request.startDate} to ${request.endDate}`,
                decisionReason: reason ?? "N/A",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // --- Tool 5: onboard_crew_member ---
  server.tool(
    "onboard_crew_member",
    "Initiate onboarding for an approved candidate. Changes candidate status to approved and creates a new crew member entry on the roster.",
    {
      candidateId: z
        .string()
        .describe("Candidate ID to onboard (e.g. CAND-001)"),
    },
    async ({ candidateId }) => {
      const raw = await getById<Record<string, unknown>>(
        CANDIDATES_TABLE,
        PARTITION_KEY,
        candidateId
      );

      if (!raw) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Candidate "${candidateId}" not found.`,
            },
          ],
          isError: true,
        };
      }

      const candidate = parseCandidate(raw);

      if (candidate.status === "approved") {
        return {
          content: [
            {
              type: "text" as const,
              text: `Candidate "${candidate.name}" has already been onboarded.`,
            },
          ],
          isError: true,
        };
      }

      if (candidate.status === "rejected") {
        return {
          content: [
            {
              type: "text" as const,
              text: `Candidate "${candidate.name}" was previously rejected and cannot be onboarded. Please re-screen the candidate first.`,
            },
          ],
          isError: true,
        };
      }

      // Update candidate status to approved
      candidate.status = "approved";
      await upsertEntity(CANDIDATES_TABLE, PARTITION_KEY, candidateId, {
        ...candidate,
        skills: JSON.stringify(candidate.skills),
      });

      // Generate a new crew ID
      const existingCrew = await getAll<Record<string, unknown>>(
        CREW_TABLE,
        PARTITION_KEY
      );
      const nextNum = existingCrew.length + 1;
      const newCrewId = `CREW-${String(nextNum).padStart(3, "0")}`;

      // Determine rank based on experience
      let rank: string;
      if (candidate.experience >= 8) rank = "Lieutenant";
      else if (candidate.experience >= 5) rank = "Specialist";
      else rank = "Ensign";

      const newMember: CrewMember = {
        id: newCrewId,
        name: candidate.name,
        rank,
        department: candidate.department,
        specialization: candidate.appliedPosition,
        status: "active",
        joinDate: new Date().toISOString().split("T")[0],
        clearanceLevel: candidate.experience >= 8 ? 3 : candidate.experience >= 5 ? 2 : 1,
      };

      await upsertEntity(CREW_TABLE, PARTITION_KEY, newCrewId, { ...newMember });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                message: `Candidate "${candidate.name}" has been onboarded successfully`,
                candidateId,
                newCrewMember: newMember,
                onboardingChecklist: [
                  "Station orientation scheduled",
                  "Security clearance issued",
                  "Quarters assigned",
                  "Medical intake appointment booked",
                  "Equipment requisition initiated",
                ],
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
