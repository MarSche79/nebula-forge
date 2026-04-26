export async function maybeSeedOnStart(seedFn: () => Promise<void>): Promise<void> {
  if (process.env.SEED_ON_START === "true") {
    console.log("🌱 SEED_ON_START=true, seeding data...");
    try {
      await seedFn();
      console.log("✅ Seed complete");
    } catch (err) {
      console.error("❌ Seed failed:", err);
    }
  }
}
