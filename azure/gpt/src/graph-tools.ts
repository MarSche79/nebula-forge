// Microsoft Graph tools for NebulaGPT.
//
// Authentication: this container authenticates as the NebulaGPT-OBO Entra app
// using client_credentials (GPT_APP_CLIENT_ID + GPT_APP_CLIENT_SECRET in env).
// All tools are "app-only" Graph calls that scope to the signed-in user via
// `/users/{oid}/...`. The user's oid comes from the X-MS-Client-Principal that
// the portal forwards.
//
// This replaces WorkIQ MCP for the multi-user web app. WorkIQ remains in the
// image and can be re-enabled via WORKIQ_ENABLED=true once Microsoft ships an
// app-only path for it.

import { z } from "zod";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { config } from "./config.js";

let _msal: ConfidentialClientApplication | null = null;
function getMsal(): ConfidentialClientApplication {
  if (_msal) return _msal;
  if (!config.gptAppClientId || !config.gptAppClientSecret) {
    throw new Error("GPT_APP_CLIENT_ID / GPT_APP_CLIENT_SECRET not configured");
  }
  _msal = new ConfidentialClientApplication({
    auth: {
      clientId: config.gptAppClientId,
      clientSecret: config.gptAppClientSecret,
      authority: `https://login.microsoftonline.com/${config.entraTenantId}`,
    },
  });
  return _msal;
}

let _cachedToken: { token: string; expiresAt: number } | null = null;
export async function getGraphAppToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.expiresAt) return _cachedToken.token;
  const result = await getMsal().acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  if (!result?.accessToken) throw new Error("Failed to acquire Graph app token");
  const expiresIn = (result.expiresOn ? result.expiresOn.getTime() - Date.now() : 3600_000) - 60_000;
  _cachedToken = { token: result.accessToken, expiresAt: Date.now() + expiresIn };
  return result.accessToken;
}

async function graphGet<T>(url: string): Promise<T> {
  const token = await getGraphAppToken();
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}`, "consistencylevel": "eventual" } });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Graph ${r.status}: ${txt.slice(0, 400)}`);
  }
  return (await r.json()) as T;
}

// ---------- Tool definitions ----------

export interface GraphToolContext {
  userOid: string;
  userUpn: string;
  userName: string;
}

interface GraphToolHandler {
  (args: Record<string, unknown>, ctx: GraphToolContext): Promise<string>;
}

interface GraphTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: GraphToolHandler;
}

function truncate(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export const graphTools: GraphTool[] = [
  {
    name: "search_emails",
    description: "Search the signed-in user's mailbox for messages matching a free-text query (subject, body, sender). Returns the most relevant 10.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text (e.g. 'budget Q3', 'from:sarah deadline')" },
        days: { type: "integer", description: "Restrict to the last N days. Default 60.", default: 60 },
      },
      required: ["query"],
    },
    handler: async (args, ctx) => {
      const q = String(args.query ?? "").trim();
      if (!q) return JSON.stringify({ error: "query required" });
      const days = Number(args.days ?? 60);
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      // Use $search for relevance ranking
      const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ctx.userOid)}/messages?$search="${encodeURIComponent(q)}"&$top=10&$select=subject,from,bodyPreview,receivedDateTime,webLink`;
      const r = await graphGet<{ value: Array<Record<string, unknown>> }>(url);
      const items = (r.value ?? []).filter((m) => new Date(String(m.receivedDateTime ?? 0)) >= new Date(since));
      return JSON.stringify({
        total: items.length,
        messages: items.map((m) => ({
          subject: m.subject,
          from: (m.from as { emailAddress?: { address?: string; name?: string } })?.emailAddress?.address ?? "",
          received: m.receivedDateTime,
          preview: truncate(m.bodyPreview, 200),
          webLink: m.webLink,
        })),
      }, null, 2);
    },
  },

  {
    name: "read_calendar",
    description: "Read the signed-in user's calendar events. Use 'today', 'tomorrow', 'this week' or an explicit ISO date range.",
    parameters: {
      type: "object",
      properties: {
        startIso: { type: "string", description: "ISO start datetime (e.g. '2026-05-15T00:00:00Z'). If omitted, uses now." },
        endIso:   { type: "string", description: "ISO end datetime. If omitted, uses startIso + 7 days." },
      },
    },
    handler: async (args, ctx) => {
      const start = String(args.startIso ?? new Date().toISOString());
      const end = String(args.endIso ?? new Date(Date.now() + 7 * 86400_000).toISOString());
      const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ctx.userOid)}/calendar/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}&$top=50&$select=subject,start,end,location,attendees,bodyPreview,webLink&$orderby=start/dateTime`;
      const r = await graphGet<{ value: Array<Record<string, unknown>> }>(url);
      return JSON.stringify({
        rangeStart: start,
        rangeEnd: end,
        total: r.value?.length ?? 0,
        events: (r.value ?? []).map((e) => ({
          subject: e.subject,
          start: (e.start as { dateTime?: string })?.dateTime,
          end: (e.end as { dateTime?: string })?.dateTime,
          location: (e.location as { displayName?: string })?.displayName ?? "",
          attendees: ((e.attendees as Array<{ emailAddress?: { name?: string } }> | undefined) ?? []).map((a) => a.emailAddress?.name).filter(Boolean),
          preview: truncate(e.bodyPreview, 200),
          webLink: e.webLink,
        })),
      }, null, 2);
    },
  },

  {
    name: "search_files",
    description: "Search the signed-in user's OneDrive + accessible SharePoint files by name / content. Returns top 10.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text (e.g. 'budget deck', 'q3 mineral report')" },
      },
      required: ["query"],
    },
    handler: async (args, ctx) => {
      const q = String(args.query ?? "").trim();
      if (!q) return JSON.stringify({ error: "query required" });
      const body = { requests: [{
        entityTypes: ["driveItem"],
        query: { queryString: q },
        from: 0, size: 10,
      }] };
      const token = await getGraphAppToken();
      const r = await fetch("https://graph.microsoft.com/v1.0/search/query", {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) return JSON.stringify({ error: `Graph search failed: ${r.status} ${await r.text()}` });
      const json = (await r.json()) as { value?: Array<{ hitsContainers?: Array<{ hits?: Array<Record<string, unknown>> }> }> };
      const hits = json.value?.[0]?.hitsContainers?.[0]?.hits ?? [];
      return JSON.stringify({
        total: hits.length,
        files: hits.map((h) => {
          const res = (h.resource as Record<string, unknown>) ?? {};
          return {
            name: res.name,
            webUrl: res.webUrl,
            lastModified: res.lastModifiedDateTime,
            summary: truncate(h.summary, 200),
            size: res.size,
          };
        }),
      }, null, 2);
    },
  },

  {
    name: "list_sharepoint_sites",
    description: "List SharePoint sites the user has access to in the tenant.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Optional name filter" } } },
    handler: async (args) => {
      const q = String(args.query ?? "").trim();
      const url = q
        ? `https://graph.microsoft.com/v1.0/sites?search=${encodeURIComponent(q)}`
        : `https://graph.microsoft.com/v1.0/sites?$top=20`;
      const r = await graphGet<{ value: Array<Record<string, unknown>> }>(url);
      return JSON.stringify({
        total: r.value?.length ?? 0,
        sites: (r.value ?? []).map((s) => ({
          name: s.displayName,
          webUrl: s.webUrl,
          description: truncate(s.description, 200),
        })),
      }, null, 2);
    },
  },

  {
    name: "find_people",
    description: "Find people (colleagues) by name, role, or department. Returns up to 10 matches.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Name fragment or job title" } },
      required: ["query"],
    },
    handler: async (args) => {
      const q = String(args.query ?? "").trim();
      if (!q) return JSON.stringify({ error: "query required" });
      const url = `https://graph.microsoft.com/v1.0/users?$search="displayName:${encodeURIComponent(q)}" OR "jobTitle:${encodeURIComponent(q)}" OR "mail:${encodeURIComponent(q)}"&$top=10&$select=displayName,mail,jobTitle,department,officeLocation`;
      const r = await graphGet<{ value: Array<Record<string, unknown>> }>(url);
      return JSON.stringify({
        total: r.value?.length ?? 0,
        people: r.value ?? [],
      }, null, 2);
    },
  },

  {
    name: "list_recent_teams_messages",
    description: "Read recent channel messages the signed-in user has access to. Optionally filter by team or channel name.",
    parameters: {
      type: "object",
      properties: {
        teamName:    { type: "string", description: "Filter to this team's display name" },
        channelName: { type: "string", description: "Filter to this channel's display name" },
        limit:       { type: "integer", description: "Max messages (default 20)", default: 20 },
      },
    },
    handler: async (args, ctx) => {
      const limit = Math.min(Number(args.limit ?? 20), 50);
      // Discover joined teams for the user
      const teamsResp = await graphGet<{ value: Array<{ id: string; displayName: string }> }>(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ctx.userOid)}/joinedTeams?$select=id,displayName`,
      );
      let teams = teamsResp.value ?? [];
      if (args.teamName) {
        const tn = String(args.teamName).toLowerCase();
        teams = teams.filter((t) => t.displayName.toLowerCase().includes(tn));
      }
      const collected: Array<Record<string, unknown>> = [];
      for (const t of teams.slice(0, 5)) {
        let channels: Array<{ id: string; displayName: string }> = [];
        try {
          const chResp = await graphGet<{ value: Array<{ id: string; displayName: string }> }>(
            `https://graph.microsoft.com/v1.0/teams/${t.id}/channels?$select=id,displayName`,
          );
          channels = chResp.value ?? [];
        } catch { continue; }
        if (args.channelName) {
          const cn = String(args.channelName).toLowerCase();
          channels = channels.filter((c) => c.displayName.toLowerCase().includes(cn));
        }
        for (const ch of channels.slice(0, 3)) {
          try {
            const msgResp = await graphGet<{ value: Array<Record<string, unknown>> }>(
              `https://graph.microsoft.com/v1.0/teams/${t.id}/channels/${ch.id}/messages?$top=10`,
            );
            for (const m of msgResp.value ?? []) {
              if ((m as { messageType?: string }).messageType !== "message") continue;
              collected.push({
                team: t.displayName, channel: ch.displayName,
                from: (m.from as { user?: { displayName?: string } })?.user?.displayName ?? "(bot)",
                createdDateTime: m.createdDateTime,
                preview: truncate((m.body as { content?: string })?.content ?? "", 300),
                webUrl: m.webUrl,
              });
            }
          } catch { /* channel may be private, skip */ }
        }
      }
      collected.sort((a, b) => String(b.createdDateTime).localeCompare(String(a.createdDateTime)));
      return JSON.stringify({ total: collected.length, messages: collected.slice(0, limit) }, null, 2);
    },
  },
];

export async function dispatchGraphTool(name: string, args: Record<string, unknown>, ctx: GraphToolContext): Promise<string> {
  const tool = graphTools.find((t) => t.name === name);
  if (!tool) return JSON.stringify({ error: `Unknown tool: ${name}` });
  try {
    return await tool.handler(args, ctx);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}
