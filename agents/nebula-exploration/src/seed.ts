import { seedTable } from "@nebula-forge/shared";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "..", "data");

const PARTITION_KEY = "nebula-forge";

export async function seed() {
  console.log("🌌 Seeding Nebula Exploration Navigator data...\n");

  const missions = JSON.parse(
    readFileSync(path.join(dataDir, "missions.json"), "utf-8")
  );
  await seedTable(
    "nfMissions",
    PARTITION_KEY,
    missions.map((m: Record<string, unknown>) => ({
      ...m,
      crew: JSON.stringify(m.crew),
      objectives: JSON.stringify(m.objectives),
    })),
    (m: { id: string }) => m.id
  );

  const celestialBodies = JSON.parse(
    readFileSync(path.join(dataDir, "celestial-bodies.json"), "utf-8")
  );
  await seedTable(
    "nfCelestialBodies",
    PARTITION_KEY,
    celestialBodies.map((cb: Record<string, unknown>) => ({
      ...cb,
      coordinates: JSON.stringify(cb.coordinates),
      knownResources: JSON.stringify(cb.knownResources),
    })),
    (cb: { id: string }) => cb.id
  );

  const routes = JSON.parse(
    readFileSync(path.join(dataDir, "routes.json"), "utf-8")
  );
  await seedTable(
    "nfRoutes",
    PARTITION_KEY,
    routes.map((r: Record<string, unknown>) => ({
      ...r,
      waypoints: JSON.stringify(r.waypoints),
    })),
    (r: { id: string }) => r.id
  );

  console.log("\n✅ Exploration Navigator seeding complete!");
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
}
