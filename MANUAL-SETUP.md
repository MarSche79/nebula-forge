# NebulaForge Agent Army — Manual M365 / Azure setup

This guide covers the **one-off admin steps** that cannot be automated from
code. After these are done, the new 5 agents and the Kanban board generate
real Documents, Teams chat and Defender / Purview alerts on their own.

> Estimated effort: ~30–45 minutes of clicking, performed once.
> Required roles: **Global Administrator** (or Compliance Admin + SharePoint Admin + Teams Admin).

---

## 0. Pre-requisites already in place

These were created before this task started — no action needed:

* SharePoint site **`NebulaForgeAgentSharePoint`**
  https://mngenvmcap805678.sharepoint.com/sites/NebulaForgeAgentSharePoint
* Teams team **`NebulaForgeAgentSharePoint`** (groupId `97739fbf-d610-46a1-be5a-b14790cd9181`)
* The base NebulaForge azd environment is provisioned, the bicep + image set
  for the 5 new agents has been deployed.

---

## 1. Create the service-account mailbox `agentops`

This account will *own* the Power Automate flows so SharePoint edits and
Teams messages appear as a real human user.

1. Sign in to https://admin.microsoft.com as a Global Admin.
2. **Users → Active users → Add a user**
   * Display name: `Agent Operations`
   * Username: `agentops@<your-tenant>.onmicrosoft.com`
   * Password: pick a strong one, save in your secret manager
3. Assign a license that includes **Office 365 + Power Automate per-user**:
   * Office 365 E3 / E5, *or* Microsoft 365 Business Premium with the
     `Power Automate for Office 365` service plan enabled.
4. Sign in to https://outlook.office.com **once as `agentops`** to provision the mailbox.

---

## 2. Add `agentops` to the demo SharePoint and Teams

### SharePoint
1. Open the site: https://mngenvmcap805678.sharepoint.com/sites/NebulaForgeAgentSharePoint
2. **Settings (⚙) → Site permissions → Advanced permissions settings**
3. Add `agentops@<tenant>.onmicrosoft.com` to the **Members** group (Edit
   permission).

### Teams
1. Open the team `NebulaForgeAgentSharePoint` in Teams.
2. **Manage team → Members → Add member**, add `agentops`. Promote to
   **Owner** so they can post in any channel.

---

## 3. Recreate the four Power Automate flows as `agentops`

> **Sign out of Power Automate as yourself first.** Then sign back in
> **as `agentops@<tenant>.onmicrosoft.com`** at https://make.powerautomate.com.

> ⚠ **Important — do NOT paste the whole `.flow.json` file anywhere.**
> Those files are reference only. Power Automate's "Request Body JSON Schema"
> field rejects expressions and reserved keys (it will say
> *"TriggerInputSchemaInvalid … expressions are not supported"*).
> You'll paste **just the small schema snippet** shown below into the trigger,
> then build the action with the UI dropdowns.

For each flow:

1. **+ Create → Instant cloud flow** — name it (e.g. `pa-teams-post-message`),
   choose trigger **"When an HTTP request is received"**.
2. Paste **only the schema snippet** for that flow (see tables below) into the
   trigger's "Request Body JSON Schema" field — nothing else.
3. Click **+ New step → Add an action**, pick the action listed below
   (e.g. *"Post message in a chat or channel"*). Sign in the connector
   **as `agentops`** if prompted.
4. Fill the action's inputs using the **dropdowns / pickers**, not JSON.
   Use the lightning-bolt "Dynamic content" icon to bind fields to the
   trigger output. For Teams flows set **Post as = User** so messages
   show `agentops` as the author, not "Flow bot".
5. **Save** the flow. Re-open the trigger and **copy the HTTP POST URL** —
   that's the webhook your agents will call.

### Flow 1 — `pa-teams-post-message`
**Trigger schema (paste this exact JSON):**
```json
{
  "type": "object",
  "properties": {
    "channel":  { "type": "string" },
    "subject":  { "type": "string" },
    "message":  { "type": "string" }
  },
  "required": ["message"]
}
```
**Action:** *Post message in a chat or channel* (Microsoft Teams).
* Post as: **User**
* Post in: **Channel**
* Team: pick `NebulaForgeAgentSharePoint` from the dropdown
* Channel: pick `General` from the dropdown
* Message: bind to the trigger's `message` dynamic content

### Flow 2 — `pa-purview-cc-trigger`
Same trigger schema as Flow 1. Same action with the same settings.
The point of having it as a *separate* flow is to scope a different
Communication Compliance policy to its activity if you want.

### Flow 3 — `pa-sharepoint-create-doc`
**Trigger schema:**
```json
{
  "type": "object",
  "properties": {
    "folder":      { "type": "string" },
    "fileName":    { "type": "string" },
    "content":     { "type": "string" },
    "contentType": { "type": "string" },
    "title":       { "type": "string" }
  },
  "required": ["folder", "fileName", "content"]
}
```
**Action:** *Create file* (SharePoint).
* Site Address: `https://mngenvmcap805678.sharepoint.com/sites/NebulaForgeAgentSharePoint`
* Folder Path: expression `concat('Shared Documents/', triggerBody()?['folder'])`
  (or use the picker: type `Shared Documents/`, then add dynamic `folder`)
* File Name: trigger's `fileName`
* File Content: trigger's `content`

### Flow 4 — `pa-sharepoint-apply-label`
**Trigger schema:**
```json
{
  "type": "object",
  "properties": {
    "folder":   { "type": "string" },
    "fileName": { "type": "string" },
    "label":    { "type": "string" }
  },
  "required": ["folder", "fileName", "label"]
}
```
**Actions (two in sequence):**
1. *Get file metadata using path* (SharePoint).
   * Site Address: same as Flow 3.
   * File Path: expression `concat('Shared Documents/', triggerBody()?['folder'], '/', triggerBody()?['fileName'])`
2. *Apply sensitivity label to a file* (SharePoint).
   * Site Address: same.
   * File Identifier: dynamic content `Id` from step 1.
   * Label: trigger's `label`.

---

At the end you'll have four URLs:

| Flow | Env var | Where it's used |
|---|---|---|
| `pa-teams-post-message`     | `PA_TEAMS_WEBHOOK`     | Pulsar Herald — routine Teams posts |
| `pa-purview-cc-trigger`     | `PA_CC_WEBHOOK`        | Pulsar Herald + Sentinel — CC trigger posts |
| `pa-sharepoint-create-doc`  | `PA_SP_CREATE_WEBHOOK` | Nebula Scribe — publish docs |
| `pa-sharepoint-apply-label` | `PA_SP_LABEL_WEBHOOK`  | Quasar Sentinel + Scribe — apply Purview labels |

Set them in the azd environment and re-provision:

```pwsh
azd env set PA_TEAMS_WEBHOOK      'https://prod-NN.westeurope.logic.azure.com:443/workflows/.../triggers/manual/paths/invoke?api-version=2016-06-01&sp=...&sig=...'
azd env set PA_CC_WEBHOOK         '<url 2>'
azd env set PA_SP_CREATE_WEBHOOK  '<url 3>'
azd env set PA_SP_LABEL_WEBHOOK   '<url 4>'
azd provision        # rewires the 5 agent container apps with the secrets
```

---

## 4. Authorise the Logic App's Log Analytics connection

The Defender ingest Logic App (`la-defender-ingest-…`) was deployed but its
API connection needs a one-time consent to write to your Log Analytics
workspace.

1. Open the Logic App in the Azure portal.
2. **API connections → azureloganalyticsdatacollector → Edit API connection**.
3. Confirm the workspace ID + primary shared key are populated (Bicep already
   passed them; if blank, paste them from the workspace's *Agents → Primary key*).
4. **Save**. Trigger a test:
   `Invoke-RestMethod -Method Post -Uri "$env:LA_DEFENDER_WEBHOOK" -Body (@{eventType='Test'; user='agentops@example'} | ConvertTo-Json) -ContentType 'application/json'`
5. After 5–10 minutes, a custom table `NebulaForgeAgentSignals_CL` appears in
   the workspace — confirm with a KQL query:
   ```kusto
   NebulaForgeAgentSignals_CL | take 10
   ```

---

## 5. Microsoft Purview policies (the "real alerts" layer)

### 5.1 Sensitivity labels
1. https://purview.microsoft.com → **Information Protection → Labels**.
2. Publish a **label group** with: `Public`, `Internal`, `Confidential`, `HighlyConfidential`.
3. Assign the publishing policy to **All users** (or a security group containing `agentops`).

### 5.2 Data Loss Prevention
1. **Purview → Data Loss Prevention → Policies → Create policy**.
2. Template: **Custom**, scope **SharePoint sites + Teams chat & channel messages**.
3. Locations: *include* the `NebulaForgeAgentSharePoint` site and the
   `NebulaForgeAgentSharePoint` Teams team.
4. Conditions — add three rules, each *Block + Notify*:
   * **Credit Card Number** (built-in SIT)
   * **U.S. Social Security Number (SSN)** (built-in SIT)
   * **Custom regex** named `NebulaForge API Key`:
     `nf_(live|test)_[0-9a-f]{32}` — confidence Low, count 1.
5. Turn the policy **On** immediately. Wait 1–4 hours for the first matches
   to surface in **Purview → DLP → Alerts** after Nebula Scribe drops a
   `billing-recon` / `crew-id-dump` / `infra-keys` document.

### 5.3 Communication Compliance
1. **Purview → Communication Compliance → Policies → Create**.
2. Template: **Offensive language in messages** + **Sensitive information**
   (use the same DLP SITs).
3. Reviewers: yourself (or a small admin group).
4. Locations: the `NebulaForgeAgentSharePoint` Teams team.
5. After Pulsar Herald posts a CC-trigger message, it appears in
   **Communication Compliance → Alerts** within ~30 minutes.

---

## 6. Microsoft Defender XDR custom detection

The Auditor pushes signals into `NebulaForgeAgentSignals_CL`. Surface them
as Defender XDR incidents:

1. https://security.microsoft.com → **Hunting → Custom detection rules → Create**.
2. KQL:
   ```kusto
   NebulaForgeAgentSignals_CL
   | where TimeGenerated > ago(30m)
   | where eventType_s in ('SuspiciousInboxRule','MassFileDownload','OAuthAppConsentGrant','RiskyUserSignIn')
   | extend AccountUpn = tostring(user_s)
   | project Timestamp = TimeGenerated, ReportId = id_s, eventType_s, AccountUpn, detail_s
   ```
3. **Frequency**: every 1 hour, **Alert title**: `Nebula Forge synthetic ${eventType_s}`.
4. Map entities → **Account → AccountUpn**.
5. Severity: Medium. Save & enable.

---

## 7. Defender for Cloud Apps (optional, for richer SaaS-layer alerts)

If Defender for Cloud Apps is connected to your tenant:

1. **Cloud Apps → Policies → Activity policy → Create**.
2. Pre-built template **"Mass download by a single user"** — single-action
   match the file pattern `MassFileDownload`.
3. Save & enable.

---

## 8. Defender for AI (already configured)

No action needed. Void Whisperer fires adversarial prompts on schedule
(every 30 min) at the existing OpenAI account `oai-jiehil2zaklu2`. Alerts
keep flowing in **Defender for Cloud → Security alerts** under that resource.

---

## 9. Verify end-to-end

After steps 1–6 are done and you've waited ~1 hour:

| Surface | What you should see |
|---|---|
| SharePoint `NebulaForgeAgentSharePoint/Shared Documents/AgentDrops` | Markdown files dropped by Nebula Scribe — author = `agentops` |
| Teams team `General` channel | Routine + CC-trigger posts from `agentops` |
| Purview → DLP alerts | Hits on Credit Card / SSN / NebulaForge API key |
| Purview → Communication Compliance | Matches on offensive / regulated language |
| Defender XDR → Incidents | Alerts named `Nebula Forge synthetic …` |
| Defender for Cloud → Security alerts (against `oai-jiehil2zaklu2`) | Continuous Defender for AI alerts (jailbreak, credential theft, malicious URL, recon) |
| Portal → Agents Board | Tasks you create are dispatched, status flips to Done |
| Portal → Agents Board → Activity feed | Reverse-chronological row for every action above |

If any row in the table is missing, check the agent's container app log:
```pwsh
az containerapp logs show -g rg-nebula-forge-<env> -n ca-scribe-<token> --tail 50
```

---

# Phase 2 — NebulaGPT (added 2026-05-14)

NebulaGPT is the internal Threat-Ninja employee assistant. It uses Azure OpenAI gpt-4o plus the Microsoft WorkIQ MCP server, grounds answers in your M365 data, can generate documents, save them to SharePoint, and surfaces Microsoft Defender + Purview alerts at `/security-alerts`.

## A. Entra app reg + admin consent (one-off)

NebulaGPT signs users in via the **same Entra app reg used by the rest of the portal** (Easy Auth). You only need to add Microsoft Graph delegated permissions and grant admin consent.

1. https://entra.microsoft.com → **Applications → App registrations → "NebulaForge Portal (Container Apps)"** (or whatever you named it).
2. **API permissions → + Add a permission → Microsoft Graph → Delegated**, add:
   - `User.Read`
   - `Sites.Read.All`
   - `Files.ReadWrite.All`
   - `Mail.Read`
   - `ChannelMessage.Read.All`
   - `Calendars.Read`
   - `SecurityEvents.Read.All`
   - `SecurityAlert.Read.All`
3. Click **Grant admin consent for <tenant>**. Everyone in your tenant can now sign in to NebulaGPT and the Graph API will accept their tokens.
4. **Authentication → Single-page application** redirect URIs — verify `https://<your-portal>/.auth/login/aad/callback` is listed (it should be from Phase 1).

## B. WorkIQ admin consent (one-off)

WorkIQ is a Microsoft-published MCP server that needs admin consent against its own multi-tenant app reg before it can read tenant M365 data.

1. As a tenant **Global Admin**, open the consent URL from the [WorkIQ tenant admin guide](https://github.com/microsoft/work-iq/blob/main/ADMIN-INSTRUCTIONS.md):
   `https://login.microsoftonline.com/<your-tenant-id>/adminconsent?client_id=<workiq-app-id>`
   (the repo has a one-click URL — read the latest version of the doc; the client_id is the Microsoft-published WorkIQ app.)
2. Approve the requested permissions (these are read-only Graph scopes covering Mail, Files, Sites, Teams, Calendar, People).
3. On the NebulaGPT container's *first* MCP request, WorkIQ caches a token in the container's tmp dir. If you suspect the cache went stale, `az containerapp revision restart` cycles it.

> Note: WorkIQ runs **inside** the `ca-gpt-…` container as a subprocess (`workiq mcp`). It is installed globally in the Docker image. There is nothing extra to deploy.

## C. SharePoint "NebulaGPT-Uploads" library

Where user-uploaded files and generated `.md` docs land. Tenant DLP scans this library because it's a normal SharePoint document library.

1. Open https://mngenvmcap805678.sharepoint.com/sites/NebulaForgeAgentSharePoint
2. **+ New → Document library**, name it **`NebulaGPT-Uploads`**.
3. Optional: apply a default sensitivity label of `Internal` so DLP fires only on the explicitly sensitive content NebulaGPT/Scribe drop in.

## D. Save-doc Power Automate flow

Recreate as the **agentops** service account (same identity that runs the Phase 1 flows):

1. In https://make.powerautomate.com (signed in as `agentops`), **+ Create → Instant cloud flow → "When an HTTP request is received"**.
2. Trigger schema — paste:
   ```json
   {
     "type": "object",
     "properties": {
       "folder":        { "type": "string" },
       "fileName":      { "type": "string" },
       "content":       { "type": "string" },
       "contentBase64": { "type": "string" },
       "contentType":   { "type": "string" },
       "uploadedBy":    { "type": "string" }
     },
     "required": [ "fileName" ]
   }
   ```
3. Add a **Condition**: `triggerBody()?['contentBase64']` is **not equal to** empty string.
4. **If yes** — SharePoint *Create file* action:
   - Site: `https://mngenvmcap805678.sharepoint.com/sites/NebulaForgeAgentSharePoint`
   - Folder Path: `Shared Documents/` + dynamic `folder`
   - File Name: dynamic `fileName`
   - File Content: expression `base64ToBinary(triggerBody()?['contentBase64'])`
5. **If no** — same Create file action, but File Content = dynamic `content` (plain text path).
6. **Response** action (after the condition): status 200, body `{ "ok": true, "fileName": "@{triggerBody()?['fileName']}" }`.
7. Save, open the trigger, copy the HTTP POST URL, then:
   ```pwsh
   azd env set PA_SAVE_DOC_WEBHOOK '<paste url here>'
   azd provision      # wires the URL into ca-gpt as a Container App secret
   ```

The full template JSON is checked in at `azure/flows/pa-nebulagpt-save-doc.flow.json` for reference.

## E. Microsoft Agent 365 (Entra Agent ID preview)

To make NebulaGPT show up in **https://entra.microsoft.com → Agents** for governance:

1. https://entra.microsoft.com → **Identity → Applications → Agent ID (Preview) → + New agent**.
2. Name: `NebulaGPT`, Description: `Internal Threat Ninja AI assistant grounded in M365 data via WorkIQ`.
3. Assigned identity: pick the existing **NebulaForge Portal** app reg.
4. Owner: yourself.
5. Save.

This registers NebulaGPT as a workload identity that Entra governs. From Agent Center you can disable / re-consent / rotate secrets.

## F. Verify

After provision + deploy:

1. Open **https://ca-portal-jiehil2zaklu2.../nebula-gpt** signed in as a `*@threatninja.at` user.
2. Ask "What's on my calendar tomorrow?" — should see tool activity (Graph tool call) and a grounded answer.
3. Ask "Draft a status update for project X" — copy or click **Save to SharePoint** — file should land in `NebulaGPT-Uploads`.
4. Upload a PDF using the paperclip icon — should appear in **Uploads** drawer + in `NebulaGPT-Uploads`.
5. Open **/security-alerts** — should list recent Defender/Purview alerts (limited by what your account can see).
6. From a `*@somethingelse.example` account, signing in should fail / be redirected — tenant lock is at the Easy Auth app reg + a redundant `tid` check at the API.

---

# Phase 2 close-out — what to know on resume

## State as of 2026-05-14

| Status | Surface |
|---|---|
| ✅ Live | 9 original MCP agents (HR…Med-bay) |
| ✅ Live | 5 new agents (Scribe, Herald, Sentinel, Auditor, Whisperer) |
| ✅ Live | Cron tick `*/30 * * * *` autonomously firing all 5 agents |
| ✅ Live | Agents Board + Activity feed at `/agents-board` |
| ✅ Live | NebulaGPT at `/nebula-gpt` — Azure OpenAI gpt-4o + Microsoft Graph tools (app-only) |
| ✅ Live | Security Alerts at `/security-alerts` — Graph Security `alerts_v2` |
| ✅ Live | 3 of 4 Power Automate flows (Teams post, CC trigger, SP create-doc) |
| ✅ Live | All 14 agents registered as Entra app regs (tag `NebulaForgeAgent`) |
| ✅ Live | `agents.*` + `gpt.*` PostgreSQL schemas |
| ✅ Live | Defender Logic App `la-defender-ingest-…` writes to `NebulaForgeAgentSignals_CL` |
| 🟡 Disabled | WorkIQ MCP subprocess — single-user model doesn't fit a multi-user app (kept in image, feature-flagged) |
| ⏳ TODO | 4th Power Automate flow (`pa-sharepoint-apply-label`) — see §D |
| ⏳ TODO | Defender XDR HIGH-severity custom-detection rule — see below |

## On resume — 3 things left to do

### 1. Author the HIGH-severity custom detection rule

Microsoft's built-in Defender for AI alerts (jailbreak, CredentialTheft, MaliciousURL, SensitiveDataLeak, LLM Recon) all rate **Medium** out of the box. To get **High** severity incidents in Defender XDR's queue you need a SOC correlation rule. Author it once:

1. https://security.microsoft.com → **Hunting → Custom detection rules → + Create custom detection**.
2. **Query** — paste:

```kusto
// "AI compound — agent under attack (HIGH)"
let aiAlerts =
    AlertInfo
    | where TimeGenerated > ago(1h)
    | where ServiceSource has_any ("MicrosoftDefenderForCloud", "MicrosoftDefenderForOffice365", "Microsoft365Defender", "MicrosoftSentinel")
        or DetectionSource has_any ("AI", "Copilot", "AzureOpenAI")
        or Category has_any ("AI", "Prompt", "Jailbreak", "SensitiveDataLeak")
    | join kind=leftouter (
        AlertEvidence
        | where EntityType in ("User", "CloudApplication", "Account")
        | summarize Account = make_set(AccountUpn, 5) by AlertId
      ) on AlertId
    | project AlertTime = TimeGenerated, AlertId, Title, Severity, ServiceSource, DetectionSource, Category, Account;
let nebulaSignals =
    NebulaForgeAgentSignals_CL
    | where TimeGenerated > ago(1h)
    | extend AccountUpn = tostring(user_s),
             EventType  = tostring(eventType_s),
             SeverityRaw = tostring(severity_s),
             Compound   = tostring(compound_s)
    | summarize Events = make_set(EventType, 20), EventCount = count(),
                MaxSev = max(case(SeverityRaw == 'critical', 4,
                                  SeverityRaw == 'high', 3,
                                  SeverityRaw == 'medium', 2, 1))
      by AccountUpn, Compound;
aiAlerts
| extend Account = tostring(Account[0])
| join kind=leftouter nebulaSignals on $left.Account == $right.AccountUpn
| project Timestamp = AlertTime, AccountUpn = Account, AiAlertTitle = Title,
          AiAlertSeverity = Severity, ServiceSource, DetectionSource,
          CorrelatedSignals = Events, CompoundEventCount = EventCount,
          ReportId = AlertId
```

3. Frequency: every 1 hour, look-back 1 hour.
4. Title: `Coordinated attack on AI agent — {AiAlertTitle}`
5. **Severity: High** ← the key bit.
6. Category: `SuspiciousActivity` · MITRE `T1078` + `T1059`.
7. Entity mapping: Account → `AccountUpn`, Report ID → `ReportId`.
8. Save.

Once active, fire the trigger:
```pwsh
pwsh ./scripts/fire-high-severity.ps1 -CompromisedUser markus@threatninja.at
```
…and within 1 hour the new rule produces a **HIGH** incident correlating the Medium AI alert with our infra signals.

### 2. Recreate the 4th Power Automate flow

`pa-sharepoint-apply-label` template at `azure/flows/pa-sharepoint-apply-label.flow.json`. Recreate as `agentops`, then:
```pwsh
azd env set PA_SP_LABEL_WEBHOOK '<flow trigger URL>'
azd provision
```

### 3. Turn Purview policies ON (out of Simulation Mode)

Open https://purview.microsoft.com → DLP / Communication Compliance → for each policy click Edit → flip **Status: On**, scope = Nebula Forge agent site + team. Without this, Scribe's sensitive docs and Herald's CC-trigger messages never produce alerts.

## Operational scripts

| Script | When to use |
|---|---|
| `scripts/demo-spike.ps1 [-Intensity light\|normal\|heavy]` | Pre-demo burst across every M365 surface |
| `scripts/fire-high-severity.ps1 [-CompromisedUser <upn>]` | One-shot HIGH-severity trigger |
| `scripts/register-agents-in-entra.ps1` | Idempotent — refresh 14 agent app reg tags / metadata |

## Architecture parking-lot (next time)

* WorkIQ is single-user by design — re-enable per-developer locally, NOT in shared `ca-gpt`.
* Easy Auth tokenStore needs shared-key storage — blocked by subscription policy. Use the app-only Graph path instead (already wired).
* If you onboard **Microsoft Sentinel** on `log-jiehil2zaklu2`, port the same KQL into a scheduled analytic rule for richer correlation + incident grouping.
* `proxySharedSecret` is now sticky in azd env — don't unset `PROXY_SHARED_SECRET`, otherwise the next provision regenerates it and every `/api/*` call 401s until you restart the API + portal revisions.

