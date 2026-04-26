import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";

export interface AuthUser {
  oid: string;
  name: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const FAKE_USER: AuthUser = {
  oid: "00000000-0000-0000-0000-000000000000",
  name: "Local Dev User",
  email: "dev@nebula-forge.local"
};

const PROXY_SHARED_SECRET = process.env.PROXY_SHARED_SECRET || "";

interface ClientPrincipalClaim {
  typ?: string;
  val?: string;
}
interface ClientPrincipal {
  claims?: ClientPrincipalClaim[];
  // Common direct fields (Easy Auth occasionally surfaces these alongside claims)
  identityProvider?: string;
  userId?: string;
  userDetails?: string;
  userRoles?: string[];
  // EasyAuth v2 (Container Apps) format
  auth_typ?: string;
  name_typ?: string;
  role_typ?: string;
}

function decodeClientPrincipal(header: string | undefined): ClientPrincipal | null {
  if (!header) return null;
  try {
    const json = Buffer.from(header, "base64").toString("utf8");
    return JSON.parse(json) as ClientPrincipal;
  } catch {
    return null;
  }
}

function pickClaim(p: ClientPrincipal, types: string[]): string | undefined {
  for (const t of types) {
    const c = p.claims?.find((x) => x.typ === t);
    if (c?.val) return c.val;
  }
  return undefined;
}

function userFromPrincipal(
  p: ClientPrincipal,
  fallbackName?: string,
  fallbackId?: string,
): AuthUser {
  const oid = pickClaim(p, [
    "http://schemas.microsoft.com/identity/claims/objectidentifier",
    "oid",
    "sub",
  ]) ?? p.userId ?? fallbackId ?? "";
  const name = pickClaim(p, [
    "name",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
    "preferred_username",
  ]) ?? p.userDetails ?? fallbackName ?? "Unknown";
  const email = pickClaim(p, [
    "email",
    "preferred_username",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "upn",
  ]) ?? p.userDetails ?? "";
  return { oid, name, email };
}

/**
 * Authentication middleware for the Nebula Forge API.
 *
 * Trust model:
 *   browser → Easy Auth (validates user) → portal Next.js proxy → API
 *
 * The portal proxy, being the only legitimate caller, attaches:
 *   1. X-Proxy-Auth: <shared secret> — proves the request came from the portal
 *      (defense in depth on top of the API being internal-only).
 *   2. X-MS-Client-Principal* — the platform-injected user identity that
 *      Easy Auth verified.
 *
 * The browser CANNOT supply either header because the proxy strips inbound
 * `x-proxy-auth` and `x-ms-*` before forwarding.
 *
 * When AUTH_ENABLED is false (local dev), all requests pass with a fake user.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.authEnabled) {
    req.user = FAKE_USER;
    next();
    return;
  }

  // 1. Verify shared secret — protects against any rogue caller that somehow
  //    reaches the internal API endpoint.
  if (!PROXY_SHARED_SECRET) {
    res.status(500).json({ error: "Server misconfigured: PROXY_SHARED_SECRET not set" });
    return;
  }
  const presented = req.header("x-proxy-auth") || "";
  if (!constantTimeEquals(presented, PROXY_SHARED_SECRET)) {
    res.status(401).json({ error: "Invalid proxy authentication" });
    return;
  }

  // 2. Decode the user identity that Easy Auth verified.
  const principalHeader = req.header("x-ms-client-principal") || undefined;
  const principal = decodeClientPrincipal(principalHeader);
  if (!principal) {
    res.status(401).json({ error: "Missing or invalid X-MS-Client-Principal header" });
    return;
  }
  req.user = userFromPrincipal(
    principal,
    req.header("x-ms-client-principal-name") || undefined,
    req.header("x-ms-client-principal-id") || undefined,
  );
  next();
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
