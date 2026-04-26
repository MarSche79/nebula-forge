import { seedTable } from "@nebula-forge/shared";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const PARTITION_KEY = "nebula-forge";

export async function seed(): Promise<void> {
  const incidents = require("../data/incidents.json");
  const radiationReadings = require("../data/radiation-readings.json");
  const emergencyProtocols = require("../data/emergency-protocols.json");

  await seedTable(
    "nfIncidents",
    PARTITION_KEY,
    incidents,
    (r: Record<string, unknown>) => r.id as string
  );

  await seedTable(
    "nfRadiation",
    PARTITION_KEY,
    radiationReadings,
    (r: Record<string, unknown>) => r.sectorId as string
  );

  await seedTable(
    "nfProtocols",
    PARTITION_KEY,
    emergencyProtocols,
    (p: Record<string, unknown>) => p.id as string
  );
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("seed.ts")) {
  seed()
    .then(() => console.log("✅ Nebula Safety data seeded"))
    .catch(console.error);
}
