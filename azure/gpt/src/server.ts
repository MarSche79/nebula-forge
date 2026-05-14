import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { sessionsRouter, chatRouter } from "./routes-chat.js";
import { uploadsRouter, generateRouter } from "./routes-uploads.js";
import { alertsRouter } from "./routes-alerts.js";

const app = express();

app.use(cors({
  origin: config.portalOrigin === "*" ? true : config.portalOrigin,
  credentials: true,
}));
app.use(express.json({ limit: "5mb" }));

app.get("/api/gpt/health", (_req, res) => {
  res.json({
    status: "healthy",
    workiqEnabled: config.workiqEnabled,
    openaiDeployment: config.openaiDeployment,
    postgres: config.postgres.enabled,
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/gpt/sessions", sessionsRouter);
app.use("/api/gpt/chat", chatRouter);
app.use("/api/gpt/uploads", uploadsRouter);
app.use("/api/gpt/generate", generateRouter);
app.use("/api/gpt/alerts", alertsRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[gpt] unhandled:", err);
  res.status(500).json({ error: "Internal server error", detail: err.message });
});

app.listen(config.port, () => {
  console.log(`[nebula-gpt] listening on :${config.port}`);
  console.log(`[nebula-gpt] tenant lock: ${config.allowedTenantId || "(none)"}`);
  console.log(`[nebula-gpt] openai deployment: ${config.openaiDeployment}`);
  console.log(`[nebula-gpt] workiq: ${config.workiqEnabled ? `${config.workiqCommand} ${config.workiqArgs.join(" ")}` : "disabled"}`);
});
