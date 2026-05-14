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

For each `.flow.json` file under `azure/flows/`:

1. **+ Create → Instant cloud flow** — choose trigger **"When an HTTP request is received"**.
2. Open the JSON template in a text editor; copy the **`triggers.manual.inputs.schema`**
   block into the trigger's "Request Body JSON Schema" field.
3. Add the action(s) listed in the JSON file (e.g. *Post message in a chat or channel* /
   *Create file* / *Apply sensitivity label to a file*). For Teams flows use
   **Post as = User**, not "Flow bot", so messages show `agentops` as the author.
4. For the SharePoint flows, set the site URL to
   `https://mngenvmcap805678.sharepoint.com/sites/NebulaForgeAgentSharePoint` and
   the folder to `Shared Documents/AgentDrops`.
5. **Save** the flow. Open the trigger again and **copy the HTTP POST URL**.
6. Repeat for all four flows. You'll have four URLs at the end:

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
