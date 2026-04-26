# Nebula Forge — Architecture & System Documentation

> **Status:** Live  
> **Production URL:** <https://www.nebula-forge.at> (custom domain)  
> **Platform URL:** <https://ca-portal-jiehil2zaklu2.blueforest-2582abfc.westeurope.azurecontainerapps.io>  
> **Last verified:** 2026-04-26

This document is the source of truth for how the Nebula Forge platform is
built, deployed, and operated. If something on disk disagrees with this doc,
**fix the doc** — it has to keep working as the reference.

---

## Contents

1. [System overview](#1-system-overview)
2. [Repository layout](#2-repository-layout)
3. [Azure resources (live)](#3-azure-resources-live)
4. [Identity & authentication](#4-identity--authentication)
5. [Network & trust boundaries](#5-network--trust-boundaries)
6. [Frontend (portal)](#6-frontend-portal)
7. [Backend API & Master Agent](#7-backend-api--master-agent)
8. [Child MCP agents](#8-child-mcp-agents)
9. [Data model](#9-data-model)
10. [Configuration matrix](#10-configuration-matrix)
11. [Build & deployment](#11-build--deployment)
12. [HR screening pipeline + Defender for AI](#12-hr-screening-pipeline--defender-for-ai)
13. [Known issues / limitations](#13-known-issues--limitations)

---

## 1. System overview

```
                     ┌────────────────────────────────────────┐
                     │            Microsoft Entra ID          │
                     │  App reg "NebulaForge Portal (CA)"     │
                     │  appId 2eaec8d9-e39c-4051-9560-…       │
                     └──────────────────┬─────────────────────┘
                                        │ OIDC
                                        ▼
   Browser  ──────►  Container Apps Easy Auth (sidecar)
                                        │  injects X-MS-Client-Principal
                                        ▼
                     ┌────────────────────────────────────────┐
                     │  ca-portal  (Next.js 15, App Router)   │  external ingress
                     │  • / public landing                    │
                     │  • /careers (+ /careers/[id]) public   │
                     │  • /command-center (auth-gated)        │
                     │  • /dashboard      (auth-gated)        │
                     │  • /api/[...path]  hardened proxy      │
                     └──────────────────┬─────────────────────┘
                                        │ + X-Proxy-Auth (shared secret)
                                        │ + X-MS-Client-Principal (forwarded)
                                        ▼
                     ┌────────────────────────────────────────┐
                     │  ca-api  (Express, Master Agent)       │  internal ingress
                     │  /api/health  /api/agents              │
                     │  /api/me      /api/chat (SSE)          │
                     └─────┬──────────────────────────────┬───┘
                           │ Azure OpenAI (gpt-4o-mini)   │ MCP / JSON-RPC
                           ▼                              ▼
                     ┌──────────────┐         ┌────────────────────────┐
                     │ oai-…        │         │ ca-{hr, materials,     │
                     │ AAD-only     │         │  exploration, science, │
                     └──────────────┘         │  safety, engineering,  │
                                              │  logistics, comms,     │
                                              │  medbay} — 9 MCPs      │
                                              └─────────┬──────────────┘
                                                        │ Tables data plane (AAD)
                                                        ▼
                                              ┌────────────────────────┐
                                              │ stjiehil2zaklu2        │
                                              │ Azure Tables           │
                                              └────────────────────────┘
```

**Key idea**: a single OpenAI-driven **Master Agent** in `ca-api` exposes 9
`ask_<agent>` function tools. When the LLM picks one, the API does a
**second OpenAI completion** scoped to that child's MCP toolset, the LLM
fills in the structured arguments from the user's question, and the API
calls the chosen MCP tool. Tool result feeds back into the master loop until
a final natural-language answer streams to the browser as Server-Sent Events.

---

## 2. Repository layout

```
ThreatNinja Agents/
├── README.md                  ← project intro
├── DEPLOYMENT.md              ← legacy deployment notes
├── ARCHITECTURE.md            ← THIS FILE (source of truth)
├── OPERATIONS.md              ← runbook
│
├── package.json               ← workspaces root (npm workspaces)
├── tsconfig.json
│
├── packages/
│   └── shared/                ← @nebula-forge/shared
│       └── src/
│           ├── data-store.ts  ← TableClient via DefaultAzureCredential
│           ├── mcp-base.ts    ← Express /mcp JSON-RPC server, /health, /tools
│           ├── seed-helper.ts
│           └── types.ts       ← AgentConfig
│
├── agents/                    ← the 9 MCP servers (one folder each)
│   ├── nebula-hr/             ← src/main.ts, src/seed.ts, manifests/, data/
│   ├── nebula-materials/
│   ├── nebula-exploration/
│   ├── nebula-science/
│   ├── nebula-safety/
│   ├── nebula-engineering/
│   ├── nebula-logistics/
│   ├── nebula-comms/
│   └── nebula-medbay/
│
├── azure/                     ← everything that ships to Azure
│   ├── azure.yaml             ← azd service map (11 services)
│   ├── infra/
│   │   ├── main.bicep         ← subscription scope, creates RG
│   │   ├── resources.bicep    ← composes all modules
│   │   ├── main.parameters.json
│   │   └── modules/
│   │       ├── containerapps-env.bicep
│   │       ├── containerapp-portal.bicep   ← Easy Auth + portal env
│   │       ├── containerapp-api.bicep      ← internal ingress + CORS lock
│   │       ├── containerapp-mcp.bicep      ← shared template for 9 MCPs
│   │       ├── identity.bicep              ← user-assigned MI + role grants
│   │       ├── monitoring.bicep            ← LA + App Insights (90 d)
│   │       ├── storage.bicep
│   │       ├── registry.bicep              ← ACR (admin off)
│   │       ├── openai.bicep
│   │       ├── foundry.bicep               ← AI Hub + Project + KV
│   │       ├── diagnostics.bicep           ← LA diag settings
│   │       └── entra-app.bicep             ← (legacy, unused)
│   │
│   ├── api/                   ← @nebula-forge/api  (Express, port 3000)
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── server.ts
│   │       ├── config.ts
│   │       ├── auth/jwt.ts             ← requireAuth (proxy secret + principal)
│   │       ├── routes/{health,me,agents,chat}.ts
│   │       └── agent/
│   │           ├── master-agent.ts     ← 2-tier dispatch
│   │           ├── mcp-client.ts       ← JSON-RPC client (HTTPS, sessions)
│   │           └── openai-client.ts    ← AzureOpenAI via MI
│   │
│   ├── portal/                ← @nebula-forge/portal  (Next.js 15)
│   │   ├── Dockerfile
│   │   ├── DESIGN-SYSTEM.md
│   │   └── src/
│   │       ├── middleware.ts          ← gates /command-center, /dashboard
│   │       ├── app/
│   │       │   ├── layout.tsx
│   │       │   ├── globals.css        ← design tokens + components
│   │       │   ├── page.tsx           ← public landing
│   │       │   ├── careers/
│   │       │   │   ├── page.tsx       ← jobs list (uses JobsBrowser)
│   │       │   │   └── [id]/page.tsx  ← job detail (SSG: 10 prerendered)
│   │       │   ├── command-center/page.tsx
│   │       │   ├── dashboard/page.tsx
│   │       │   └── api/[...path]/route.ts ← hardened proxy
│   │       ├── components/
│   │       │   ├── MarketingNav.tsx   ← public nav
│   │       │   ├── AppNav.tsx         ← authed nav
│   │       │   ├── ChatPanel.tsx      ← inline chat (was ChatWidget popup)
│   │       │   ├── JobsBrowser.tsx    ← careers list + filter
│   │       │   ├── ThemeToggle.tsx
│   │       │   └── Footer.tsx
│   │       └── lib/
│   │           ├── api.ts             ← chatStream (SSE client)
│   │           ├── crewUser.ts        ← reads X-MS-Client-Principal in RSC
│   │           ├── agents.ts          ← 9 agent metadata
│   │           ├── stationData.ts     ← dashboard mock data
│   │           ├── jobs.ts            ← typed jobs API
│   │           └── jobs-data.json     ← 10 verbatim job postings
│   │
│   ├── mcp-shared/            ← Dockerfile reused by all 9 MCP services
│   └── scripts/
│       └── diagnose-api.ps1   ← end-to-end diagnostic
│
└── copilot-studio/            ← Microsoft Copilot Studio agent (unused in Azure flow)
```

---

## 3. Azure resources (live)

All in resource group **`rg-nebula-forge-nebula-forge`** (West Europe).

| Resource | Name | Notes |
|---|---|---|
| Container Apps Environment | `cae-jiehil2zaklu2` | Consumption profile, **no VNet** (immutable) |
| User-assigned MI | `id-jiehil2zaklu2` | client-id `a3b14ceb-…` — shared by all apps |
| Container Registry | `acrjiehil2zaklu2` | Basic, **admin user OFF**, MI has `AcrPull` |
| Storage account | `stjiehil2zaklu2` | Tables only, `allowSharedKeyAccess=false` (AAD-only) |
| Key Vault | `kv-my6eyz3msvjve` | `publicNetworkAccess=Disabled`, RBAC + purge protection |
| Azure OpenAI | `oai-jiehil2zaklu2` | `disableLocalAuth=true` (AAD-only), deployment `gpt-4o-mini` |
| Log Analytics | `log-jiehil2zaklu2` | 90-day retention; receives diag from KV/ACR/Storage/OAI |
| App Insights | `appi-jiehil2zaklu2` | LA-backed, used by all containers |
| AI Foundry Hub | `aih-jiehil2zaklu2` | Created storage child container (unused by us) |
| AI Foundry Project | `aip-jiehil2zaklu2` | Connected to OAI account |
| Container App — portal | `ca-portal-jiehil2zaklu2` | External ingress, Easy Auth |
| Container App — api | `ca-api-jiehil2zaklu2` | **Internal** ingress only |
| Container Apps × 9 (MCP) | `ca-{hr,materials,exploration,science,safety,engineering,logistics,comms,medbay}-jiehil2zaklu2` | Internal ingress, scale-to-zero |

**Public DNS / endpoints**:
- Production (custom domain): `www.nebula-forge.at` (managed cert auto-renewed by Container Apps)
- Platform FQDN: `ca-portal-jiehil2zaklu2.blueforest-2582abfc.westeurope.azurecontainerapps.io`
- Internal API: `ca-api-jiehil2zaklu2.internal.blueforest-2582abfc.westeurope.azurecontainerapps.io`

---

## 4. Identity & authentication

### 4.1 Identities

| Principal | OID / clientId | Used by |
|---|---|---|
| Managed Identity `id-jiehil2zaklu2` | client `a3b14ceb-…`, principal `cd6b8b7d-…` | All container apps (one MI for everything) |
| Entra app `NebulaForge Portal (Container Apps)` | client `2eaec8d9-…` | Easy Auth on the portal **and** API audience |

### 4.2 RBAC role grants on the MI

| Role | Scope |
|---|---|
| `Storage Table Data Contributor` | storage account |
| `Cognitive Services User` + `Cognitive Services OpenAI User` | OAI account |
| `AcrPull` | ACR |
| `Azure AI Developer` | AI Foundry workspace (legacy) |

### 4.3 Easy Auth (portal)

Configured imperatively + in `containerapp-portal.bicep`
(`Microsoft.App/containerApps/authConfigs@2024-03-01`):

```yaml
platform.enabled:                 true
globalValidation:
  unauthenticatedClientAction:    AllowAnonymous   # public landing needs this
  redirectToProvider:             azureactivedirectory
identityProviders.azureActiveDirectory:
  registration.clientId:          2eaec8d9-…
  registration.clientSecretSettingName: aad-client-secret      # CA secret
  registration.openIdIssuer:      https://login.microsoftonline.com/<tenant>/v2.0
  validation.allowedAudiences:    [api://<clientId>, <clientId>]
login.tokenStore.enabled:         false   # SAS-blob backing incompatible w/ AAD-only storage
httpSettings.forwardProxy.convention: Standard
  # MANDATORY for any custom domain. Tells Easy Auth to honour
  # X-Forwarded-Host / X-Forwarded-Proto so OAuth callbacks use the
  # hostname the user actually requested. Without it the AppServiceAuthSession
  # cookie ends up bound to the original Azure FQDN and same-origin POSTs
  # from the custom domain return 401. (Bug #7 in OPERATIONS.md.)
```

### 4.4 The proxy → API trust boundary

The portal's Next.js catch-all proxy (`src/app/api/[...path]/route.ts`) is the
*only* legitimate caller of the API. Trust is established by **two** things on
every request:

1. **`X-Proxy-Auth: <shared secret>`** — symmetric secret stored as a Container
   Apps secret on **both** apps (`proxy-shared-secret`). Default param value
   in `resources.bicep` is `newGuid()`, so each `azd provision` rotates the
   secret in lockstep on both sides. The browser cannot forge this header
   because the proxy strips inbound `x-proxy-auth` before forwarding.
2. **`X-MS-Client-Principal`** — base64-JSON of the user's claims, attached
   server-side by the Easy Auth sidecar. The proxy strips inbound `x-ms-*`
   before reading the trusted Easy-Auth-attached headers, so a malicious
   browser can't impersonate a user.

The API's `requireAuth` middleware (`azure/api/src/auth/jwt.ts`) verifies
both with constant-time comparison and decodes the principal into
`req.user = { oid, name, email }`.

### 4.5 Page gating

Easy Auth is `AllowAnonymous`, so anybody can hit the site. Auth is enforced
at:

- **Page level** by `azure/portal/src/middleware.ts` — matcher
  `['/command-center/:path*', '/dashboard/:path*']`. If
  `X-MS-Client-Principal` is missing on those routes, redirect (HTTP 307) to
  `/.auth/login/aad?post_login_redirect_uri=<orig>`.
- **API level** by the proxy + `requireAuth` chain above. Anonymous calls to
  `/api/chat` get 401 from the API itself.

### 4.6 Secret inventory

| Secret | Where stored | Rotation |
|---|---|---|
| AAD client secret (Easy Auth) | CA secret `aad-client-secret` on `ca-portal`; value passed via secure bicep param sourced from azd env `AAD_CLIENT_SECRET` | 2-year lifetime; rotate by `az ad app credential reset --id <appId>` then `azd env set AAD_CLIENT_SECRET <new>` then `azd provision` |
| Proxy shared secret | CA secret `proxy-shared-secret` on **both** `ca-portal` and `ca-api`; bicep default `newGuid()` | Auto-rotates on every `azd provision` |
| Storage account key | n/a | Shared-key access **disabled** |
| Azure OpenAI key | n/a | Local auth **disabled** (AAD only) |

---

## 5. Network & trust boundaries

| Boundary | Enforced by | Notes |
|---|---|---|
| Public internet → portal | Container Apps ingress (HTTPS only, `allowInsecure=false`) | No WAF in front yet |
| Portal page → page | Next.js middleware | gates `/command-center`, `/dashboard` |
| Portal browser → API | Proxy at `/api/[...path]` | path allow-list (`health, me, agents, chat, chat/reset`); inbound headers `x-ms-*`, `x-forwarded-*`, `authorization`, `cookie`, `x-proxy-auth` are stripped |
| Portal Next.js → API | Internal CAE DNS only (HTTPS) | `ca-api-…internal.…`, public ingress is **off** |
| API → child MCPs | Internal CAE DNS (HTTPS) | URLs pulled from `MCP_*_URL` env on API |
| API → Azure OpenAI | Public endpoint, AAD-only token via MI | |
| MCP children → Storage Tables | Public endpoint, AAD-only via MI | `publicNetworkAccess=Enabled` because CAE has no VNet — see §12 |
| Service-to-service auth | Managed Identity tokens (no shared keys anywhere) | |

---

## 6. Frontend (portal)

### 6.1 Stack

- Next.js 15 (App Router, RSC), React 19, TypeScript strict
- Tailwind CSS + design tokens in `globals.css` (light theme default, dark theme via `data-theme="dark"`)
- `lucide-react` icons
- No client-side auth library — Easy Auth + middleware handle everything

### 6.2 Routes

| Route | Type | Auth | Purpose |
|---|---|---|---|
| `/` | static (SSR) | public | Marketing landing — hero, mission, departments, by-the-numbers, CTA |
| `/careers` | static | public | Job listings (search + dept filter via `JobsBrowser` client island) |
| `/careers/[id]` | SSG (10 paths) | public | Job detail — sections + sticky "Apply" rail (button currently disabled) |
| `/command-center` | RSC | **gated** | Inline `ChatPanel` + sidebar (mission status, open incidents, specialist roster) |
| `/dashboard` | RSC | **gated** | KPI tiles + 8 widgets: systems, crew, power grid, missions, experiments, samples, incidents, comms |
| `/api/[...path]` | dynamic | proxy | Forwards allow-listed paths to the API; injects `x-proxy-auth`, forwards principal |
| `/.auth/login/aad`, `/.auth/logout`, `/.auth/me` | platform | Easy Auth | Container Apps Easy Auth endpoints |

### 6.3 Design system

Source of truth: `azure/portal/DESIGN-SYSTEM.md`. Tokens (light theme):

```
--primary  #0e8ab5    --accent #6246d6
--success  #0ba677    --warning #d08a08    --danger #dc3545
--text     #1a2a3a    --text-muted #4a6a82  --text-dim #7a96ad
--bg-deep  #eef4fa    --bg-card rgba(255,255,255,0.82)
--radius-sm 8 / --radius-md 14 / --radius-lg 20
```

Common classes in `globals.css`:
`.container-nf` · `.section-label` · `.card` · `.glass` · `.btn-primary`
· `.btn-outline` · `.btn-ghost` · `.btn-sm` / `.btn-lg` · `.pill` ·
`.text-highlight` · `.scroll-custom` · `.nebula-bg` · `.starfield`

### 6.4 Key client behaviour

- Theme persists in `localStorage` as `nf-theme`, applied pre-hydration via
  inline script in `layout.tsx` (no FOUC).
- Chat thread id persists in `sessionStorage` as `nf-command-thread`.
- `ChatPanel` consumes the SSE stream from `/api/chat` and renders three
  event types: `tool` (renders department-coloured pill above the bubble),
  `token` (appends to the assistant message), and `done` (marks complete).
- `MarketingNav` Sign-In button always points at
  `/.auth/login/aad?post_login_redirect_uri=/command-center`.
- `AppNav` shows the user's name (decoded from `X-MS-Client-Principal` in
  the RSC parent), with sign-out at `/.auth/logout?post_logout_redirect_uri=/`.
- **All modal dialogs MUST be rendered via `createPortal(jsx, document.body)`.**
  A modal that's a descendant of a `position: sticky` (or `transform`-ed)
  parent has its hit-testing re-anchored to that parent's containing block,
  even though the visual layout still appears viewport-anchored. Half the
  modal becomes click-through to the page behind. See `ApplyModal.tsx` for
  the canonical pattern.
- **Any RSC that needs to call the API server-side** must use
  `lib/serverApi.ts` (which goes directly to the **internal** API FQDN with
  the proxy shared secret + forwarded `X-MS-Client-Principal`). Going
  through the public `/api/*` proxy from RSC fails because the proxy strips
  inbound `x-ms-*` headers and only re-injects what the Easy Auth sidecar
  attaches — and server-to-server fetches don't carry the user's session
  cookie, so the API receives no principal and returns 401.

---

## 7. Backend API & Master Agent

### 7.1 Endpoints

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/api/health` | none | `{status, uptime, version}` |
| GET | `/api/me` | required | `{user}` decoded from principal |
| GET | `/api/agents` | required | List of 9 agents + per-agent `status: online|offline` (best-effort `mcpListTools`) |
| POST | `/api/chat/reset` | required | Wipe a thread |
| POST | `/api/chat` | required | SSE stream: `event: thread`, `event: tool`, `event: tool-result`, `event: token` (chunked), `event: done`, `event: error` |

### 7.2 Master Agent loop

Inside `runChat` (`agent/master-agent.ts`):

1. Append user message to thread (in-memory `Map<threadId, messages>` — not
   durable; restart loses threads).
2. Call Azure OpenAI (`gpt-4o-mini`) with the thread + 9 `ask_<agent>`
   function tools.
3. If the response has `tool_calls`, dispatch them **in parallel** via
   `dispatchAskTool` and append each result as a `tool` message.
4. Loop up to `MAX_ROUNDS = 5`.
5. When a final assistant message arrives, return its content.

`/api/chat` route streams that final text in 64-char chunks at 10 ms cadence
to keep the UI feeling alive.

### 7.3 dispatchAskTool — 2-tier routing

When the master agent picks `ask_<agent>`, the API does:

1. `mcpListTools(agent.mcpUrl)` to get the child's tools and JSON schemas.
2. **Second OpenAI completion** scoped to that child:
   - System message: "You are the {agent.name}. Pick the single most
     appropriate tool…"
   - User message: original question
   - `tools: <child's tools>`, `tool_choice: 'required'`
3. Take the chosen tool + arguments, call `mcpCallTool(url, name, args)`.
4. Return the joined `content[].text` to the master loop.

This replaces the previous heuristic dispatcher that shoved natural language
into a `question` field — fixing tools whose schemas required real
parameters.

### 7.4 MCP client

Hand-rolled JSON-RPC over HTTPS with `mcp-session-id` header (see
`agent/mcp-client.ts`). Handles the SSE-style response (`text/event-stream`)
and plain JSON. The required `notifications/initialized` notification is
sent after `initialize`.

---

## 8. Child MCP agents

### 8.1 Common shape

Every child runs the same skeleton from `@nebula-forge/shared/mcp-base.ts`
(via `npx tsx agents/<name>/src/main.ts`):

- Express on `process.env.PORT` (defaults to `config.port`)
- `GET  /health` → `{status, agent, …}`
- `GET  /tools` → JSON list (debug helper)
- `POST /mcp` → JSON-RPC: `initialize`, `ping`, `tools/list`, `tools/call`
- `GET/DELETE /mcp` → 405 "Use POST"

The child app uses `@modelcontextprotocol/sdk`'s `McpServer` to register
tools (`server.tool(name, description, zodSchema, handler)`). `mcp-base.ts`
introspects `server._registeredTools[name]` and dispatches to the user
handler. (Field is `handler` in SDK ≥ 1.29 — `mcp-base.ts` falls back to
`callback` for older versions.)

### 8.2 The 9 agents

| ID | Name | Port | Tools (5 each) |
|---|---|---|---|
| `hr` | HR Assistant | 3001 | `get_crew_roster`, `get_crew_profile`, `screen_candidate`, `process_leave_request`, `onboard_crew_member` |
| `materials` | Material Analyst | 3002 | `get_samples`, `analyze_sample`, `compare_materials`, `classify_mineral`, `get_analysis_report` |
| `exploration` | Exploration Navigator | 3003 | `list_missions`, `create_mission`, `get_celestial_bodies`, `calculate_route`, `update_mission_status` |
| `science` | Science Officer | 3004 | `get_experiments`, `log_observation`, `query_research_data`, `get_publications`, `submit_hypothesis` |
| `safety` | Safety Officer | 3005 | `get_incidents`, `report_incident`, `check_radiation_levels`, `run_safety_audit`, `get_emergency_protocols` |
| `engineering` | Chief Engineer | 3006 | `get_system_status`, `schedule_repair`, `list_repairs`, `run_diagnostics`, `get_power_grid` |
| `logistics` | Quartermaster | 3007 | `list_shipments`, `track_shipment`, `get_inventory`, `create_supply_order`, `get_storage_capacity` |
| `comms` | Comms Officer | 3008 | `get_messages`, `send_broadcast`, `check_signal_status`, `schedule_transmission`, `get_comm_logs` |
| `medbay` | Medical Officer | 3009 | `get_crew_health`, `schedule_checkup`, `get_medical_records`, `report_medical_incident`, `get_medication_inventory` |

(45 tools total. Full metadata in `azure/portal/src/lib/agents.ts`.)

### 8.3 Persistent storage

Each child uses `ensureTable(name)` from `@nebula-forge/shared` →
`@azure/data-tables` `TableClient` with `DefaultAzureCredential`.
Tables are created on first boot (idempotent, swallows 409). Seeders
(`agents/<name>/src/seed.ts`) populate sample data via `maybeSeedOnStart`.

### 8.4 Health probes

Defined in `containerapp-mcp.bicep`:
- **Startup**: HTTP `/health`, `failureThreshold: 24`, `periodSeconds: 5` (≤ 2 min)
- **Liveness**: HTTP `/health`, every 30 s
- **Readiness**: HTTP `/health`, every 10 s

Min replicas = **0** (cost-saving). Cold-start can be 30–60 s on first call
to a long-idle agent.

---

## 9. Data model

### 9.1 Live (Azure Tables)

Each child writes its domain entities to `nf<DomainCamelCase>` tables in
`stjiehil2zaklu2`. PartitionKey is always `nebula-forge`. Examples:

| Table | Owner | Entity |
|---|---|---|
| `nfCrew` | hr | CrewMember |
| `nfCandidates` | hr | Candidate |
| `nfLeaveRequests` | hr | LeaveRequest |
| `nfSamples` | materials | Sample |
| `nfMissions` | exploration | Mission |
| `nfExperiments` | science | Experiment |
| `nfIncidents` | safety | Incident |
| `nfSystems`, `nfRepairs` | engineering | System, RepairTask |
| `nfShipments`, `nfInventory` | logistics | Shipment, InventoryItem |
| `nfMessages`, `nfRelays` | comms | Message, Relay |
| `nfHealthRecords`, `nfMedications` | medbay | HealthRecord, Medication |

### 9.2 Mock / static (portal-side)

- **Dashboard widgets** read from `azure/portal/src/lib/stationData.ts`
  (typed mocks: `SYSTEMS, POWER_GRID, MISSIONS, EXPERIMENTS, INCIDENTS,
  SAMPLES, COMMS, CREW_SUMMARY, STATION_HEADLINE_STATS`). These are
  **independent** of the live MCP data — by design, so the dashboard always
  renders even when the cold-started children are warming up. Wiring the
  dashboard to live MCP responses is a documented follow-up.
- **Careers** read from `azure/portal/src/lib/jobs.ts`, which imports
  `jobs-data.json` (10 jobs across 5 departments). API at:
  `JOBS, DEPARTMENTS, deptColor(dept), findJob(id), formatPostedDate(iso)`.

### 9.3 In-memory (API)

- `runChat` keeps thread history in a process-local `Map`. **Not durable** —
  if the API replica restarts, all threads disappear (acceptable for now;
  the UI re-issues `newThreadId()` after reset).

---

## 10. Configuration matrix

### 10.1 azd environment (`azure/.azure/<env>/.env`)

| Key | Source | Used by |
|---|---|---|
| `AZURE_ENV_NAME` | azd init | resource naming |
| `AZURE_LOCATION` | azd init | all modules |
| `AZURE_SUBSCRIPTION_ID` | azd | deploy |
| `AAD_CLIENT_ID` | manually `azd env set` after creating app reg | bicep `aadClientId` |
| `AAD_CLIENT_SECRET` | manually `azd env set` from `az ad app credential reset` | bicep `aadClientSecret` (secure) |
| `AUTH_ENABLED` | manually set to `true` | bicep `authEnabled` (string→bool) |
| Various outputs: `API_BASE_URL`, `PORTAL_BASE_URL`, `AZURE_*_ENDPOINT` | written by deployment | reused by bicep + scripts |

### 10.2 Container env — portal (`ca-portal-jiehil2zaklu2`)

| Var | Value source |
|---|---|
| `PORT` | `3000` (literal) |
| `AZURE_CLIENT_ID` | MI client id (for DefaultAzureCredential, currently unused at runtime) |
| `API_BASE_URL` | `https://<api-internal-fqdn>` |
| `NEXT_PUBLIC_API_URL` | **empty** (forces same-origin `/api/*`) |
| `NEXT_PUBLIC_ENTRA_TENANT_ID` | tenant id |
| `NEXT_PUBLIC_ENTRA_CLIENT_ID` | portal app reg client id |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | App Insights output |
| `PROXY_SHARED_SECRET` | `secretRef: proxy-shared-secret` |

CA secrets: `aad-client-secret`, `proxy-shared-secret`.

### 10.3 Container env — api (`ca-api-jiehil2zaklu2`)

Adds: `AZURE_STORAGE_ACCOUNT_NAME`, `AZURE_OPENAI_ENDPOINT`,
`AZURE_OPENAI_DEPLOYMENT_NAME`, `AI_PROJECT_ENDPOINT`, `ENTRA_TENANT_ID`,
`ENTRA_CLIENT_ID`, `AUTH_ENABLED=true`, `PORTAL_ORIGIN=<portal-url>`,
plus 9 `MCP_<DEPT>_URL` (all `https://ca-<dept>-….internal.…`),
plus `PROXY_SHARED_SECRET` from secret.

CA secrets: `proxy-shared-secret`.

### 10.4 Container env — children (each MCP)

`AGENT_NAME`, `AGENT_PORT`, `PORT` (= service port 3001..3009),
`AZURE_STORAGE_ACCOUNT_NAME`, `AZURE_CLIENT_ID`,
`APPLICATIONINSIGHTS_CONNECTION_STRING`. No secrets.

---

## 11. Build & deployment

### 11.1 First-time setup

```pwsh
cd azure
azd auth login
azd env new nebula-forge          # creates the .env
azd env set AZURE_LOCATION westeurope

# Provision Azure resources (first run creates the app-reg-less infra)
azd provision

# Create the Entra app registration (one-time, manual)
$portalFqdn = azd env get-value PORTAL_FQDN
$app = az ad app create `
  --display-name "NebulaForge Portal (Container Apps)" `
  --sign-in-audience AzureADMyOrg `
  --enable-id-token-issuance true `
  --web-redirect-uris "https://$portalFqdn/.auth/login/aad/callback" `
  -o json | ConvertFrom-Json
az ad sp create --id $app.appId | Out-Null
$secret = az ad app credential reset --id $app.appId --display-name easy-auth --years 2 -o json | ConvertFrom-Json
azd env set AAD_CLIENT_ID $app.appId
azd env set AAD_CLIENT_SECRET $secret.password
azd env set AUTH_ENABLED true

# Re-provision to wire Easy Auth
azd provision

# Build & push all container images
azd deploy
```

### 11.2 Day-2 deploys

```pwsh
azd deploy api               # rebuild + redeploy just the API
azd deploy portal            # rebuild + redeploy just the portal
azd deploy hr                # one specific MCP
azd provision                # apply bicep changes (rotates proxy-shared-secret)
```

### 11.3 Image tag scheme

`<acr>.azurecr.io/nebula-forge/<service>-<env>:azd-deploy-<timestamp>`
e.g. `acrjiehil2zaklu2.azurecr.io/nebula-forge/api-nebula-forge:azd-deploy-1777194716`

### 11.4 Cache surprise

Container Apps may serve stale prerendered Next.js pages from a previous
revision for ~30 s after a portal deploy (`x-nextjs-cache: HIT` from a
revision that's already gone). If a route returns 404 right after `azd
deploy portal`, **wait 30 s and retry** before debugging.

---

## 12. HR screening pipeline + Defender for AI

The HR portal recreates the [nebulaforge-defender-ai-lab](https://github.com/Nebta/nebulaforge-defender-ai-lab-Nebta)
demo against our existing infrastructure: every submitted CV flows through
Azure OpenAI so Microsoft Defender for AI can detect prompt-injection,
jailbreaks, credential-theft attempts, phishing URLs, and LLM reconnaissance.

### 12.1 Resources added

| Resource | Name | Notes |
|---|---|---|
| PostgreSQL Flexible Server | `psql-nf-jiehil2zaklu2` | v16, Burstable_B1ms, **AAD-only auth** (`passwordAuth=Disabled`) |
| Database | `nebulaforge` | One table: `candidates` (schema in `infra/postgres-bootstrap.ps1`) |

Defender for AI is enabled at the **subscription level** (Standard tier,
already on). Every Azure OpenAI call from `oai-jiehil2zaklu2` is monitored;
alerts surface in **Defender for Cloud → Security Alerts** (~15-30 min
propagation).

### 12.2 PostgreSQL identity model

Two distinct AAD principals — least-privilege:

| Principal | Role | Scope |
|---|---|---|
| Developer (`markus@…`) | Postgres AAD admin | DDL, role grants, schema migrations |
| Managed Identity (`id-jiehil2zaklu2`) | Postgres role with `SELECT, INSERT, UPDATE, DELETE` on `candidates` only | Runtime CRUD from `ca-api` |

The MI role is mapped via `SECURITY LABEL FOR "pgaadauth" ON ROLE "<name>"
IS 'aadauth,oid=<oid>,type=service'` — created once by the bootstrap script.

Runtime auth: `pg.Pool` is configured with an **async `password` callback**
(`getBearerTokenProvider` for `https://ossrdbms-aad.database.windows.net/.default`).
A fresh AAD token is issued on every new connection; pool sockets recycle
before the 1-hour token lifetime.

### 12.3 Endpoints (extends the API surface)

| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | `/api/applications` | **anonymous** (public careers page) | Submits a CV. Hard guardrails: zod validation, 24 KB cvText cap, jobId allow-list, **per-IP rate limit 5/h**, 30 s `(email, jobId)` dedupe. Runs Interviewer + HR Manager agents and inserts to `candidates`. Returns a slim summary (no CV echo). |
| GET | `/api/applications` | required | List with `?status=`, `?department=`, `?threatOnly=`, `?source=` filters |
| GET | `/api/applications/counts` | required | KPI tiles (`source='web'` only — demo rows excluded) |
| GET | `/api/applications/:id` | required | Single record |
| POST | `/api/applications/:id/decision` | required | Hire / Reject / Delete |
| POST | `/api/applications/cleanup-demo` | required | Bulk deletes all `source='demo'` rows |
| POST | `/api/demo/submit` | required | Submits one of 5 canned attack CVs (`source='demo'`). Payloads bundled at build time at `azure/api/src/data/demo-cvs.json`; never publicly downloadable. |

### 12.4 Screening pipeline (`azure/api/src/hr/pipeline.ts`)

Two GPT-4o-mini calls in serial per submission:

1. **Interviewer Agent** → JSON `{matchScore, summary, strengths, gaps,
   interviewFocus, verdict}`
2. **HR Manager Agent** → JSON `{recommendation, rationale, nextSteps,
   riskFlags}`

Each call is wrapped in `try/catch` for `classifyContentFilterError(err)`.
On a 400 + `content_filter` (or `ResponsibleAIPolicyViolation`), the
application is stored with `status='Flagged'` and `threat_types` set to
the filtered category names. **Raw CV text is never logged** — only
`{requestId, code, innerCode}`.

### 12.5 Portal pages

| Route | Type | Auth |
|---|---|---|
| `/careers/[id]` | SSG + `ApplyButton` client island opens `ApplyModal` | public |
| `/hr` | dynamic RSC — KPI strip + `ApplicationsTable` (search, dept, status, demo toggle) | gated |
| `/hr/[id]` | dynamic RSC — candidate detail with Interviewer / HR Manager rendering + threat banner | gated |
| `/hr/threats` | dynamic RSC — `ApplicationsTable threatOnly` + alert-type legend | gated |
| `/hr/demo` | dynamic RSC — `DemoLauncher` with 5 attack-CV one-click buttons | gated |

PDF text extraction happens **client-side** in `ApplyModal` via dynamic
`import('pdfjs-dist')`. The worker is served same-origin from
`/pdf-worker/pdf.worker.min.mjs` (copied into `azure/portal/public/` from
`node_modules` during local dev). The browser only ever sends extracted
text to the API — the binary file never leaves the user's machine.

### 12.6 Trust boundary additions

The proxy allow-list (`azure/portal/src/app/api/[...path]/route.ts`) was
extended with **anchored** entries (no broad regex):

```
'health' 'me' 'agents' 'chat' 'chat/reset'
'applications' 'applications/counts' 'applications/cleanup-demo' 'demo/submit'
/applications\/<uuid>/                              (regex)
/applications\/<uuid>\/decision/                    (regex)
```

`POST /api/applications` is the **only anonymous API route** — anyone hitting
the public careers page can submit. The hard guardrails listed above mitigate
abuse; without them this would be a wide-open AI billing surface.

### 12.7 Custom domain (`www.nebula-forge.at`)

The portal serves on both the platform FQDN and `www.nebula-forge.at`.
The custom hostname is wired through bicep (`portalCustomDomains` array
in `containerapp-portal.bicep`), so it survives `azd provision`.

What had to be in place:

| Layer | Setting |
|---|---|
| DNS | `A nebula-forge.at -> 20.23.90.205` (CAE static IP), `TXT asuid -> <verifyId>`, `CNAME www -> ca-portal-…azurecontainerapps.io`, `TXT asuid.www -> <verifyId>` |
| Container Apps | `customDomains` binding with managed cert (`SniEnabled`); cert auto-renewed by Azure |
| Easy Auth | `httpSettings.forwardProxy.convention=Standard` so OAuth callbacks use the request host |
| API CORS | `extraAllowedOrigins=['https://www.nebula-forge.at']` widens the lock-down |
| Entra app reg | extra redirect URI `https://www.nebula-forge.at/.auth/login/aad/callback` |

azd env vars driving the bicep params: `PORTAL_CUSTOM_HOSTNAMES_JSON`,
`PORTAL_CUSTOM_DOMAINS_JSON` (JSON arrays).

### 12.8 Image preservation across `azd provision`

Bicep used to hard-code `image: placeholderImage` for every container
app, which meant **every `azd provision` rolled all containers back to
the platform quickstart image** — silently breaking everything that
relied on our actual code (chat, HR portal, all `/api/*`).

The fix is to thread azd's per-service `SERVICE_<NAME>_IMAGE_NAME` env
vars (which it already maintains for every deploy) into bicep:

```bicep
param apiImageName string = ''
// ... 10 more params ...

image: !empty(apiImageName) ? apiImageName : placeholderImage
```

The placeholder is now only used on the very first provision before
any `azd deploy` has run. See `azure/infra/main.parameters.json` for
the env-var → param wiring. Documented as bug #8.

---

## 13. Known issues / limitations

1. **No VNet on the Container Apps environment.** Storage / OpenAI / KV /
   Postgres public network access stays Enabled because the platform's only
   path out is the public internet. AAD-only auth + `disableLocalAuth=true`
   on OAI + `allowSharedKeyAccess=false` on storage + AAD-only on Postgres
   (`passwordAuth=Disabled`) are the partial mitigations. A clean fix
   requires recreating the CAE with VNet integration — intentionally
   deferred.

2. **Single shared MI** across portal + API + 9 children + Postgres role
   (`id-jiehil2zaklu2`). Blast radius is wider than it should be. Splitting
   into per-tier identities is on the follow-up list.

3. **Key Vault soft-delete = 7 days.** Property is immutable post-create on
   Azure KV. Recreating the vault is required to bump it to 90.

4. **Threads are in-memory.** API replica restart drops all conversations.
   Move to Cosmos / Redis when threads need to survive deploys.

5. **Cold start on children** (min replicas = 0). First call to an idle
   department can take 30–60 s; subsequent calls are warm.

6. **Dashboard data is mock.** `stationData.ts` is unrelated to the live
   MCP data. Wiring it up is a planned feature.

7. **In-memory rate limiter on `POST /api/applications`.** The 5-per-IP-per-hour
   bucket lives in the API process. With multiple replicas this becomes a
   "5 per replica" limit. Move to Redis if traffic grows.

8. **One Entra app reg serves both Easy Auth and JWT audience.** Splitting
   the API into its own app reg with OBO / app-token flows is a refactor we
   chose not to do; the proxy shared-secret model is the simpler equivalent.

9. **Custom domain `nebula-forge.at` apex is not yet wired.** Only `www.nebula-forge.at` is bound. The apex needs an `asuid.nebula-forge.at` TXT record that propagates to public DNS resolvers; once that's verifiable, repeating the same `hostname add → managed cert → bind → bicep update` flow brings it online.
