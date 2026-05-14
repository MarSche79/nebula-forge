// Easy Auth on the portal is configured (containerapp-portal.bicep) to request
// `https://graph.microsoft.com/.default` at sign-in. That means the user's
// access token already has Graph as its audience. The portal proxy forwards
// it as `X-MS-TOKEN-AAD-ACCESS-TOKEN` for /gpt/* routes only.
import type { Request } from "express";

export function getGraphTokenForUser(req: Request): string {
  const t = req.header("x-ms-token-aad-access-token");
  if (!t) throw new Error("No user access token on request (Easy Auth tokenStore disabled?)");
  return t;
}
