import { seedTable } from "@nebula-forge/shared";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const PARTITION_KEY = "nebula-forge";

export async function seed(): Promise<void> {
  const experiments = require("../data/experiments.json");
  const observations = require("../data/observations.json");
  const publications = require("../data/publications.json");

  await seedTable(
    "nfExperiments",
    PARTITION_KEY,
    experiments,
    (e: Record<string, unknown>) => e.id as string
  );

  // Serialize nested objects for Azurite
  await seedTable(
    "nfObservations",
    PARTITION_KEY,
    observations.map((o: Record<string, unknown>) => ({
      ...o,
      data: typeof o.data === "object" ? JSON.stringify(o.data) : o.data,
    })),
    (o: Record<string, unknown>) => o.id as string
  );

  // Serialize arrays for Azurite
  await seedTable(
    "nfPublications",
    PARTITION_KEY,
    publications.map((p: Record<string, unknown>) => ({
      ...p,
      authors: Array.isArray(p.authors) ? JSON.stringify(p.authors) : p.authors,
    })),
    (p: Record<string, unknown>) => p.id as string
  );
}

// Allow running directly
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("seed.ts")
) {
  console.log("🔬 Seeding Nebula Science data...\n");
  seed()
    .then(() => console.log("\n✅ Nebula Science data seeded"))
    .catch(console.error);
}
