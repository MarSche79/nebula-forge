import { seedTable } from "@nebula-forge/shared";
import messages from "../data/messages.json" with { type: "json" };
import relays from "../data/relays.json" with { type: "json" };
import transmissions from "../data/transmissions.json" with { type: "json" };

const PARTITION_KEY = "nebula-forge";

export async function seed() {
  console.log("📡 Seeding Nebula Comms data...\n");

  await seedTable(
    "nfMessages",
    PARTITION_KEY,
    messages,
    (m) => m.id as string
  );

  await seedTable(
    "nfRelays",
    PARTITION_KEY,
    relays,
    (r) => r.id as string
  );

  await seedTable(
    "nfTransmissions",
    PARTITION_KEY,
    transmissions,
    (t) => t.id as string
  );

  console.log("\n✅ Comms seeding complete!");
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed().catch(console.error);
}
