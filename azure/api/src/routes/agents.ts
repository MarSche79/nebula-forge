import { Router } from "express";
import { requireAuth } from "../auth/jwt.js";
import { CHILD_AGENTS } from "../agent/master-agent.js";

export const agentsRouter = Router();

async function pingHealth(url: string): Promise<"online" | "offline"> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url.replace(/\/$/, "") + "/health", {
      signal: controller.signal
    });
    clearTimeout(t);
    return res.ok ? "online" : "offline";
  } catch {
    return "offline";
  }
}

agentsRouter.get("/", requireAuth, async (_req, res) => {
  const results = await Promise.all(
    CHILD_AGENTS.map(async (a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      mcpUrl: a.mcpUrl,
      status: await pingHealth(a.mcpUrl)
    }))
  );
  res.json({ agents: results });
});
