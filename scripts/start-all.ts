// Start all Nebula Forge MCP servers concurrently
import { fork } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Resolve the tsx CLI entry point from node_modules
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

interface AgentInfo {
  name: string;
  port: number;
}

const agents: AgentInfo[] = [
  { name: "nebula-hr", port: 3001 },
  { name: "nebula-materials", port: 3002 },
  { name: "nebula-exploration", port: 3003 },
  { name: "nebula-science", port: 3004 },
  { name: "nebula-safety", port: 3005 },
  { name: "nebula-engineering", port: 3006 },
  { name: "nebula-logistics", port: 3007 },
  { name: "nebula-comms", port: 3008 },
  { name: "nebula-medbay", port: 3009 },
];

console.log("🌌 Nebula Forge — Starting all MCP servers...\n");
console.log("   Agent                    Port");
console.log("   ─────────────────────    ────");

const processes: ReturnType<typeof fork>[] = [];

for (const agent of agents) {
  const mainPath = path.join(root, "agents", agent.name, "src", "main.ts");
  console.log(`   ${agent.name.padEnd(24)} ${agent.port}`);

  const child = fork(tsxCli, [mainPath], {
    cwd: root,
    stdio: "inherit",
  });

  child.on("error", (err) => {
    console.error(`❌ ${agent.name} failed: ${err.message}`);
  });

  processes.push(child);
}

console.log("\n   Press Ctrl+C to stop all servers.\n");

process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down all servers...");
  for (const p of processes) {
    p.kill("SIGTERM");
  }
  process.exit(0);
});
