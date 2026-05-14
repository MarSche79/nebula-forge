import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { agentsRouter } from "./routes/agents.js";
import { chatRouter } from "./routes/chat.js";
import { applicationsRouter, demoRouter } from "./routes/applications.js";
import { boardRouter } from "./routes/board.js";

const app = express();

app.use(
  cors({
    origin: config.portalOrigin === "*" ? true : config.portalOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));

app.use("/api/health", healthRouter);
app.use("/api/me", meRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/applications", applicationsRouter);
app.use("/api/demo", demoRouter);
app.use("/api/board", boardRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[api] unhandled error:", err);
  res.status(500).json({ error: "Internal server error", detail: err.message });
});

app.listen(config.port, () => {
  console.log(`[nebula-forge api] listening on :${config.port}`);
  console.log(`[nebula-forge api] auth enabled: ${config.authEnabled}`);
  console.log(`[nebula-forge api] portal origin: ${config.portalOrigin}`);
  console.log(`[nebula-forge api] postgres configured: ${config.postgres.enabled}`);
});
