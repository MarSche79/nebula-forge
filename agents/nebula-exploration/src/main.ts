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
import type { Mission } from "@nebula-forge/shared";

const config: AgentConfig = {
  name: "Nebula Forge Exploration Navigator",
  version: "1.0.0",
  description:
    "Space exploration — mission planning, route optimization, celestial body database, and mission tracking",
  port: 3003,
  instructions:
    "You are the Exploration Navigator AI for Nebula Forge station. Help commanders plan missions, calculate routes, query celestial body data, and track mission progress. Always consider crew safety and fuel efficiency.",
};

const PARTITION_KEY = "nebula-forge";
const MISSIONS_TABLE = "nfMissions";
const CELESTIAL_TABLE = "nfCelestialBodies";
const ROUTES_TABLE = "nfRoutes";

interface CelestialBody {
  id: string;
  name: string;
  type: "asteroid" | "planet" | "moon" | "nebula" | "comet" | "station";
  coordinates: { x: number; y: number; z: number };
  distance: number;
  knownResources: string[];
  dangerLevel: "safe" | "moderate" | "hazardous" | "extreme";
  notes: string;
}

interface Route {
  id: string;
  name: string;
  waypoints: string[];
  totalDistance: number;
  estimatedDuration: number;
  fuelRequired: number;
  riskLevel: string;
  lastTraversed: string;
}

// Azure Table Storage stores arrays/objects as JSON strings — deserialize them
function parseMission(raw: Record<string, unknown>): Mission {
  return {
    ...raw,
    crew: typeof raw.crew === "string" ? JSON.parse(raw.crew) : raw.crew,
    objectives:
      typeof raw.objectives === "string"
        ? JSON.parse(raw.objectives)
        : raw.objectives,
  } as Mission;
}

function parseCelestialBody(raw: Record<string, unknown>): CelestialBody {
  return {
    ...raw,
    coordinates:
      typeof raw.coordinates === "string"
        ? JSON.parse(raw.coordinates)
        : raw.coordinates,
    knownResources:
      typeof raw.knownResources === "string"
        ? JSON.parse(raw.knownResources)
        : raw.knownResources,
  } as CelestialBody;
}

function parseRoute(raw: Record<string, unknown>): Route {
  return {
    ...raw,
    waypoints:
      typeof raw.waypoints === "string"
        ? JSON.parse(raw.waypoints)
        : raw.waypoints,
  } as Route;
}

async function main() {
  await ensureTable(MISSIONS_TABLE);
  await ensureTable(CELESTIAL_TABLE);
  await ensureTable(ROUTES_TABLE);

  const server = createMcpServer(config);

  // --- Tool 1: get_missions ---
  server.tool(
    "get_missions",
    "List all exploration missions. Optionally filter by status or type.",
    {
      status: z
        .enum(["planned", "in-progress", "completed", "aborted"])
        .optional()
        .describe("Filter missions by status"),
      type: z
        .enum(["exploration", "research", "supply-run", "rescue", "survey"])
        .optional()
        .describe("Filter missions by type"),
    },
    async ({ status, type }) => {
      const raw = await getAll<Record<string, unknown>>(
        MISSIONS_TABLE,
        PARTITION_KEY
      );
      let missions = raw.map(parseMission);

      if (status) missions = missions.filter((m) => m.status === status);
      if (type) missions = missions.filter((m) => m.type === type);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(missions, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool 2: plan_mission ---
  server.tool(
    "plan_mission",
    "Create and register a new exploration mission.",
    {
      name: z.string().describe("Mission name"),
      type: z
        .enum(["exploration", "research", "supply-run", "rescue", "survey"])
        .describe("Mission type"),
      destination: z.string().describe("Mission destination"),
      commander: z.string().describe("Commanding officer"),
      crew: z.array(z.string()).describe("List of crew member names"),
      objectives: z.array(z.string()).describe("Mission objectives"),
      departureDate: z
        .string()
        .optional()
        .describe("Planned departure date (YYYY-MM-DD)"),
    },
    async ({ name, type, destination, commander, crew, objectives, departureDate }) => {
      const existing = await getAll<Record<string, unknown>>(
        MISSIONS_TABLE,
        PARTITION_KEY
      );
      const nextNum = existing.length + 1;
      const id = `MSN-${String(nextNum).padStart(3, "0")}`;

      const mission: Mission = {
        id,
        name,
        type,
        status: "planned",
        commander,
        crew,
        destination,
        departureDate: departureDate ?? new Date().toISOString().split("T")[0],
        objectives,
      };

      await upsertEntity(MISSIONS_TABLE, PARTITION_KEY, id, {
        ...mission,
        crew: JSON.stringify(crew),
        objectives: JSON.stringify(objectives),
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Mission created successfully:\n${JSON.stringify(mission, null, 2)}`,
          },
        ],
      };
    }
  );

  // --- Tool 3: get_celestial_bodies ---
  server.tool(
    "get_celestial_bodies",
    "List celestial bodies in the database. Optionally filter by type or danger level.",
    {
      type: z
        .enum(["asteroid", "planet", "moon", "nebula", "comet", "station"])
        .optional()
        .describe("Filter by celestial body type"),
      dangerLevel: z
        .enum(["safe", "moderate", "hazardous", "extreme"])
        .optional()
        .describe("Filter by danger level"),
    },
    async ({ type, dangerLevel }) => {
      const raw = await getAll<Record<string, unknown>>(
        CELESTIAL_TABLE,
        PARTITION_KEY
      );
      let bodies = raw.map(parseCelestialBody);

      if (type) bodies = bodies.filter((b) => b.type === type);
      if (dangerLevel)
        bodies = bodies.filter((b) => b.dangerLevel === dangerLevel);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(bodies, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool 4: calculate_route ---
  server.tool(
    "calculate_route",
    "Calculate a route between two celestial bodies. Returns distance, duration, fuel, and risk assessment.",
    {
      originId: z
        .string()
        .describe("ID of the origin celestial body (e.g. CB-012)"),
      destinationId: z
        .string()
        .describe("ID of the destination celestial body (e.g. CB-003)"),
    },
    async ({ originId, destinationId }) => {
      const originRaw = await getById<Record<string, unknown>>(
        CELESTIAL_TABLE,
        PARTITION_KEY,
        originId
      );
      const destRaw = await getById<Record<string, unknown>>(
        CELESTIAL_TABLE,
        PARTITION_KEY,
        destinationId
      );

      if (!originRaw || !destRaw) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Could not find celestial body. Origin (${originId}): ${originRaw ? "found" : "not found"}, Destination (${destinationId}): ${destRaw ? "found" : "not found"}.`,
            },
          ],
          isError: true,
        };
      }

      const origin = parseCelestialBody(originRaw);
      const dest = parseCelestialBody(destRaw);

      // Euclidean distance between coordinates (light-year scale, converted to AU-like units)
      const dx = dest.coordinates.x - origin.coordinates.x;
      const dy = dest.coordinates.y - origin.coordinates.y;
      const dz = dest.coordinates.z - origin.coordinates.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const distanceAU = Math.round(distance * 100) / 100;

      // Estimated duration: ~1.4 days per AU base, with variability
      const varianceFactor = 0.9 + Math.random() * 0.2;
      const estimatedDays = Math.max(
        1,
        Math.round(distanceAU * 1.4 * varianceFactor)
      );

      // Fuel: ~280 units per AU base
      const fuelUnits = Math.round(distanceAU * 280 * varianceFactor);

      // Risk assessment based on destination danger level and distance
      const dangerScores: Record<string, number> = {
        safe: 1,
        moderate: 2,
        hazardous: 3,
        extreme: 4,
      };
      const riskScore =
        dangerScores[dest.dangerLevel] + (distanceAU > 10 ? 1 : 0);
      const riskLevels = ["low", "moderate", "high", "extreme", "extreme"];
      const riskLevel = riskLevels[Math.min(riskScore - 1, 4)];

      const routeResult = {
        origin: { id: origin.id, name: origin.name },
        destination: { id: dest.id, name: dest.name },
        distanceAU,
        estimatedDurationDays: estimatedDays,
        fuelRequired: fuelUnits,
        riskLevel,
        riskFactors: [
          `Destination danger level: ${dest.dangerLevel}`,
          distanceAU > 10
            ? "Long-range transit — increased exposure to micro-meteorites and radiation"
            : "Short-to-mid range transit",
          dest.dangerLevel === "extreme"
            ? "⚠ EXTREME HAZARD — requires Class-V shielding and commander authorization"
            : "",
        ].filter(Boolean),
        recommendations: [
          fuelUnits > 3000
            ? "Consider a fuel stop at the nearest station or ice giant"
            : "Standard fuel reserves sufficient",
          dest.dangerLevel === "hazardous" || dest.dangerLevel === "extreme"
            ? "Deploy reconnaissance drones before crewed approach"
            : "Standard approach protocols apply",
        ],
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(routeResult, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool 5: update_mission_status ---
  server.tool(
    "update_mission_status",
    "Update the status of an existing mission.",
    {
      missionId: z.string().describe("Mission ID (e.g. MSN-001)"),
      newStatus: z
        .enum(["planned", "in-progress", "completed", "aborted"])
        .describe("New status for the mission"),
    },
    async ({ missionId, newStatus }) => {
      const raw = await getById<Record<string, unknown>>(
        MISSIONS_TABLE,
        PARTITION_KEY,
        missionId
      );

      if (!raw) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Mission "${missionId}" not found.`,
            },
          ],
          isError: true,
        };
      }

      const mission = parseMission(raw);
      const oldStatus = mission.status;
      mission.status = newStatus;

      // If completing, set return date
      if (newStatus === "completed" && !mission.returnDate) {
        mission.returnDate = new Date().toISOString().split("T")[0];
      }

      await upsertEntity(MISSIONS_TABLE, PARTITION_KEY, missionId, {
        ...mission,
        crew: JSON.stringify(mission.crew),
        objectives: JSON.stringify(mission.objectives),
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Mission ${missionId} ("${mission.name}") status updated: ${oldStatus} → ${newStatus}`,
          },
        ],
      };
    }
  );

  await maybeSeedOnStart(seed);
  await startServer(server, config);
}

main().catch(console.error);
