import { seedTable } from "@nebula-forge/shared";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const PARTITION_KEY = "nebula-forge";

export async function seed(): Promise<void> {
  const crew = require("../data/crew.json");
  const candidates = require("../data/candidates.json");
  const leaveRequests = require("../data/leave-requests.json");

  await seedTable(
    "nfCrew",
    PARTITION_KEY,
    crew,
    (c: Record<string, unknown>) => c.id as string
  );

  await seedTable(
    "nfCandidates",
    PARTITION_KEY,
    candidates.map((c: Record<string, unknown>) => ({
      ...c,
      skills: JSON.stringify(c.skills),
    })),
    (c: Record<string, unknown>) => c.id as string
  );

  await seedTable(
    "nfLeaveRequests",
    PARTITION_KEY,
    leaveRequests,
    (lr: Record<string, unknown>) => lr.id as string
  );
}

// Allow running directly
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("seed.ts")
) {
  console.log("🌌 Seeding Nebula HR data...\n");
  seed()
    .then(() => console.log("\n✅ Nebula HR data seeded"))
    .catch(console.error);
}
