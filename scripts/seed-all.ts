// Seed all Nebula Forge agent data into Azurite
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const agents = [
  "nebula-hr",
  "nebula-materials",
  "nebula-exploration",
  "nebula-science",
  "nebula-safety",
  "nebula-engineering",
  "nebula-logistics",
  "nebula-comms",
  "nebula-medbay",
];

console.log("🌌 Nebula Forge — Seeding all agent data...\n");

for (const agent of agents) {
  const seedPath = path.join(root, "agents", agent, "src", "seed.ts");
  console.log(`📋 Seeding ${agent}...`);
  try {
    execSync(`npx tsx "${seedPath}"`, { cwd: root, stdio: "inherit" });
    console.log(`✅ ${agent} seeded successfully\n`);
  } catch (err) {
    console.error(`❌ Failed to seed ${agent}\n`);
  }
}

console.log("🎉 All agent data seeded!");
