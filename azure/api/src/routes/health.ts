import { Router } from "express";

export const healthRouter = Router();

const startedAt = Date.now();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    version: process.env.npm_package_version ?? "1.0.0"
  });
});
