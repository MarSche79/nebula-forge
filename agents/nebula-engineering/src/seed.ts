import { seedTable } from "@nebula-forge/shared";
import systems from "../data/systems.json" with { type: "json" };
import repairs from "../data/repairs.json" with { type: "json" };
import powerGrid from "../data/power-grid.json" with { type: "json" };

const PARTITION_KEY = "nebula-forge";

export async function seed() {
  console.log("🔧 Seeding Nebula Forge Chief Engineer data...\n");

  await seedTable("nfSystems", PARTITION_KEY, systems, (s) => s.id);

  await seedTable("nfRepairs", PARTITION_KEY, repairs, (r) => r.id);

  await seedTable(
    "nfPowerGrid",
    PARTITION_KEY,
    powerGrid.map((pg) => ({
      ...pg,
      connectedSystems: JSON.stringify(pg.connectedSystems),
    })),
    (pg) => pg.id as string
  );

  console.log("\n✅ Chief Engineer seeding complete!");
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed().catch(console.error);
}
