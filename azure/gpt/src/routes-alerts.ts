import { Router } from "express";
import { requireAuth } from "./auth.js";
import { getGraphTokenForUser } from "./obo.js";

export const alertsRouter = Router();

interface GraphAlert {
  id: string;
  title: string;
  category?: string;
  severity?: string;
  status?: string;
  description?: string;
  detectionSource?: string;
  createdDateTime?: string;
  lastUpdateDateTime?: string;
  serviceSource?: string;
  classification?: string;
  determination?: string;
  webUrl?: string;
}

alertsRouter.get("/", requireAuth, async (req, res) => {
  let token: string;
  try {
    token = getGraphTokenForUser(req);
  } catch (err) {
    res.status(403).json({ error: "No Graph token forwarded", detail: (err as Error).message });
    return;
  }

  // Microsoft Graph Security API — v2 alerts
  const url = "https://graph.microsoft.com/v1.0/security/alerts_v2?$top=200&$orderby=createdDateTime desc";
  try {
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) {
      const txt = await r.text();
      res.status(r.status).json({ error: "Graph alerts call failed", detail: txt });
      return;
    }
    const json = (await r.json()) as { value?: GraphAlert[] };
    const alerts = (json.value ?? []).map(normalize);
    res.json({ count: alerts.length, alerts });
  } catch (err) {
    res.status(502).json({ error: "Graph call exception", detail: (err as Error).message });
  }
});

function normalize(a: GraphAlert): GraphAlert & { surface: string } {
  const src = (a.serviceSource ?? "").toLowerCase();
  let surface = "other";
  if (src.includes("purview") || src.includes("compliance")) surface = "purview";
  else if (src.includes("defenderforoffice") || src.includes("mdo")) surface = "defender-office";
  else if (src.includes("defenderforendpoint") || src.includes("mde")) surface = "defender-endpoint";
  else if (src.includes("defenderforidentity") || src.includes("mdi")) surface = "defender-identity";
  else if (src.includes("defenderforcloudapps") || src.includes("mcas")) surface = "defender-mcas";
  else if (src.includes("aad") || src.includes("entra")) surface = "entra";
  else if (src.includes("defender")) surface = "defender";
  return { ...a, surface };
}
