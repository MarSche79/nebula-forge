import { seedTable } from "@nebula-forge/shared";
import medicalRecords from "../data/medical-records.json" with { type: "json" };
import medications from "../data/medications.json" with { type: "json" };
import checkupSchedule from "../data/checkup-schedule.json" with { type: "json" };

const PARTITION_KEY = "nebula-forge";

export async function seed() {
  console.log("🏥 Seeding Nebula Medbay data...\n");

  await seedTable(
    "nfMedicalRecords",
    PARTITION_KEY,
    medicalRecords,
    (r) => r.id as string
  );

  await seedTable(
    "nfMedications",
    PARTITION_KEY,
    medications,
    (m) => m.id as string
  );

  await seedTable(
    "nfCheckupSchedule",
    PARTITION_KEY,
    checkupSchedule,
    (c) => c.id as string
  );

  console.log("\n✅ Medbay seeding complete!");
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed().catch(console.error);
}
