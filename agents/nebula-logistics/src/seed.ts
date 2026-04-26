import { seedTable } from "@nebula-forge/shared";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "..", "data");

const PARTITION_KEY = "nebula-forge";

export async function seed() {
  console.log("📦 Seeding Nebula Forge Quartermaster data...\n");

  const shipments = JSON.parse(
    readFileSync(path.join(dataDir, "shipments.json"), "utf-8")
  );
  await seedTable(
    "nfShipments",
    PARTITION_KEY,
    shipments.map((s: Record<string, unknown>) => ({
      ...s,
      items: JSON.stringify(s.items),
    })),
    (s: { id: string }) => s.id
  );

  const inventory = JSON.parse(
    readFileSync(path.join(dataDir, "inventory.json"), "utf-8")
  );
  await seedTable(
    "nfInventory",
    PARTITION_KEY,
    inventory,
    (i: { id: string }) => i.id
  );

  const supplyOrders = JSON.parse(
    readFileSync(path.join(dataDir, "supply-orders.json"), "utf-8")
  );
  await seedTable(
    "nfSupplyOrders",
    PARTITION_KEY,
    supplyOrders.map((o: Record<string, unknown>) => ({
      ...o,
      items: JSON.stringify(o.items),
    })),
    (o: { id: string }) => o.id
  );

  console.log("\n✅ Quartermaster seeding complete!");
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
}
