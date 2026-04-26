import { seedTable } from "@nebula-forge/shared";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "..", "data");

const TABLE_SAMPLES = "nfsamples";
const TABLE_REPORTS = "nfanalysisreports";
const PK = "nebula-forge";

export async function seed() {
  console.log("🧪 Seeding Nebula Materials data...\n");

  const samples = JSON.parse(
    readFileSync(path.join(dataDir, "samples.json"), "utf-8")
  );
  await seedTable(TABLE_SAMPLES, PK, samples, (s: { id: string }) => s.id);

  const reports = JSON.parse(
    readFileSync(path.join(dataDir, "analysis-reports.json"), "utf-8")
  );
  await seedTable(TABLE_REPORTS, PK, reports, (r: { id: string }) => r.id);

  console.log("\n✅ Nebula Materials data seeded successfully!");
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
}
