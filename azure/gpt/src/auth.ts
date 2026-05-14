import type { Request, Response, NextFunction } from "express";
import { Buffer } from "node:buffer";
import { config } from "./config.js";

export interface CrewPrincipal {
  oid: string;
  name: string;
  upn: string;
  tid: string;
  raw: Record<string, unknown>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: CrewPrincipal;
    }
  }
}

function decodeEasyAuthPrincipal(b64: string): Record<string, unknown> | null {
  try {
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pickClaim(claims: unknown, names: string[]): string {
  if (!Array.isArray(claims)) return "";
  for (const n of names) {
    const c = (claims as Array<{ typ?: string; val?: string }>).find((x) => x.typ === n);
    if (c?.val) return c.val;
  }
  return "";
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Validates proxy shared secret + decodes the Easy Auth principal header
 * the portal forwarded. Enforces the single-tenant lock by comparing the
 * tid claim against ALLOWED_TENANT_ID.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // 1. Proxy shared secret (defence in depth)
  if (config.proxySharedSecret) {
    const got = String(req.headers["x-proxy-auth"] ?? "");
    if (!got || !safeEqual(got, config.proxySharedSecret)) {
      res.status(401).json({ error: "Invalid proxy auth" });
      return;
    }
  }

  // 2. Easy Auth principal
  const principalB64 = req.headers["x-ms-client-principal"];
  if (!principalB64 || Array.isArray(principalB64)) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const decoded = decodeEasyAuthPrincipal(principalB64);
  if (!decoded) {
    res.status(401).json({ error: "Bad principal" });
    return;
  }

  const claims = decoded.claims ?? [];
  const oid = pickClaim(claims, [
    "http://schemas.microsoft.com/identity/claims/objectidentifier",
    "oid",
  ]);
  const name = pickClaim(claims, [
    "name",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
  ]) || String(req.headers["x-ms-client-principal-name"] || "");
  const upn = pickClaim(claims, [
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn",
    "preferred_username",
    "upn",
  ]);
  const tid = pickClaim(claims, [
    "http://schemas.microsoft.com/identity/claims/tenantid",
    "tid",
  ]);

  if (!oid) {
    res.status(401).json({ error: "Missing oid" });
    return;
  }

  // 3. Tenant lock
  if (config.allowedTenantId && tid && tid !== config.allowedTenantId) {
    res.status(403).json({ error: "Tenant not allowed" });
    return;
  }

  req.user = { oid, name, upn, tid, raw: decoded };
  next();
}
