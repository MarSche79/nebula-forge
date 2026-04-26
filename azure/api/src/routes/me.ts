import { Router } from "express";
import { requireAuth } from "../auth/jwt.js";

export const meRouter = Router();

meRouter.get("/", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
