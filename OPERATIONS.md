# Nebula Forge — Operations Runbook

> Companion to **ARCHITECTURE.md**. Use this when something needs doing
> against the live environment or you're hunting a regression.

## Contents

1. [Daily operations](#1-daily-operations)
2. [Deploy & rollback](#2-deploy--rollback)
3. [Diagnostics](#3-diagnostics)
4. [Incident playbook](#4-incident-playbook)
5. [Smoke tests](#5-smoke-tests)
6. [Common pitfalls we hit & how to avoid them](#6-common-pitfalls-we-hit--how-to-avoid-them)
7. [Defender for AI demo](#7-defender-for-ai-demo)
8. [Decommissioning / costs](#8-decommissioning--costs)

---

## 1. Daily operations

### Tail logs (any container app)

```pwsh
$rg = "rg-nebula-forge-nebula-forge"
az containerapp logs show -n ca-api-jiehil2zaklu2     -g $rg --tail 100 --format text
az containerapp logs show -n ca-portal-jiehil2zaklu2  -g $rg --tail 100 --format text
az containerapp logs show -n ca-hr-jiehil2zaklu2      -g $rg --tail 100 --format text
```

If a child shows **"Could not find a replica"**, it's scaled to zero — make
a request to the live portal (or `/api/agents`) to wake it.

### Restart a single revision

```pwsh
$rg = "rg-nebula-forge-nebula-forge"
$rev = az containerapp revision list -n ca-api-jiehil2zaklu2 -g $rg `
       --query "[?properties.active].name | [0]" -o tsv
az containerapp revision restart -n ca-api-jiehil2zaklu2 -g $rg --revision $rev
```

### Inspect what's actually deployed

```pwsh
az containerapp show -n ca-api-jiehil2zaklu2 -g $rg `
  --query "{rev:properties.latestRevisionName, image:properties.template.containers[0].image, env:properties.template.containers[0].env[].name}" -o json
```

---

## 2. Deploy & rollback

### Standard deploy

```pwsh
cd azure
azd deploy api               # backend code
azd deploy portal            # frontend
azd deploy hr                # one MCP
azd deploy                   # all 11 services
azd provision                # apply bicep changes (also rotates proxy-shared-secret)
```

### Rollback to a previous revision

```pwsh
$rg = "rg-nebula-forge-nebula-forge"
$old = az containerapp revision list -n ca-portal-jiehil2zaklu2 -g $rg `
        --query "[1].name" -o tsv     # second-newest
az containerapp ingress traffic set -n ca-portal-jiehil2zaklu2 -g $rg `
   --revision-weight "${old}=100"
```

(Switch back via the same command with the new revision name.)

### Rotate the AAD client secret

```pwsh
$appId = azd env get-value AAD_CLIENT_ID
$new = az ad app credential reset --id $appId --display-name easy-auth-rotated --years 2 -o json | ConvertFrom-Json
azd env set AAD_CLIENT_SECRET $new.password
azd provision      # re-applies the secret to ca-portal
```

The proxy-shared-secret is auto-rotated on every `azd provision` (bicep
default = `newGuid()`, applied to **both** portal and API in one shot).

---

## 3. Diagnostics

### One-shot full diagnostic

```pwsh
& "C:\Users\markus\Documents\Code\ThreatNinja Agents\azure\scripts\diagnose-api.ps1"
# writes azure/scripts/diagnose-output.log
```

The script checks: azd env values, container app revisions, env vars,
ingress config, all `/api/health` and `/api/agents` probes (direct + via
portal proxy), and tails the last 200 log lines of the API.

### Verify routing & gating

```pwsh
$portal = "https://ca-portal-jiehil2zaklu2.blueforest-2582abfc.westeurope.azurecontainerapps.io"

# Public landing — should be 200
curl.exe -s -o NUL -w "HTTP:%{http_code}\n" -H "Accept: text/html" -H "User-Agent: Mozilla/5.0" "$portal/"

# Gated routes — should be 307 → /.auth/login/aad
curl.exe -s -o NUL -w "HTTP:%{http_code} | Location:%header{location}\n" `
   -H "Accept: text/html" -H "User-Agent: Mozilla/5.0" "$portal/command-center"
curl.exe -s -o NUL -w "HTTP:%{http_code} | Location:%header{location}\n" `
   -H "Accept: text/html" -H "User-Agent: Mozilla/5.0" "$portal/dashboard"

# /api/chat anonymously — should be 401
curl.exe -s -o NUL -w "HTTP:%{http_code}\n" -X POST "$portal/api/chat" `
   -H "Content-Type: application/json" -d '{"message":"hi"}'

# Easy Auth login should redirect to MS
curl.exe -s -o NUL -w "HTTP:%{http_code} | Location:%header{location}\n" `
   "$portal/.auth/login/aad?post_login_redirect_uri=/"
```

### Verify identity wiring

```pwsh
$rg = "rg-nebula-forge-nebula-forge"
az containerapp auth show -n ca-portal-jiehil2zaklu2 -g $rg `
  --query "{enabled:platform.enabled, action:globalValidation.unauthenticatedClientAction, clientId:identityProviders.azureActiveDirectory.registration.clientId}" -o json
az containerapp secret list -n ca-portal-jiehil2zaklu2 -g $rg -o table
az containerapp secret list -n ca-api-jiehil2zaklu2    -g $rg -o table
```

Both apps must show `proxy-shared-secret`. Portal must also show
`aad-client-secret`.

### Inspect a child MCP

Children are internal-only, so probe via the API container instead:

```pwsh
$rg = "rg-nebula-forge-nebula-forge"
az containerapp exec -n ca-api-jiehil2zaklu2 -g $rg `
  --command "wget -qO- https://ca-hr-jiehil2zaklu2.internal.blueforest-2582abfc.westeurope.azurecontainerapps.io/health"
```

(If exec fails with "cannot attach", the container has scaled to zero —
trigger a chat first to wake it, then retry.)

---

## 4. Incident playbook

| Symptom | First check | Likely cause |
|---|---|---|
| Chat says **"chat failed: 401"** | `az containerapp logs show -n ca-api-…` filter for `[auth]` lines | proxy-shared-secret out of sync (run `azd provision`) OR Easy Auth not attaching `X-MS-Client-Principal` (sign out + back in) |
| Chat says **"failed to reach the Master Agent"** | Same logs, look for `mcp-client` errors | A child MCP is unreachable (504 / 405 / cold-start timeout). Trigger a warm-up by hitting `/api/agents`. |
| Public landing returns **404** right after deploy | Wait 30 s, retry | Stale Next.js prerender cache from previous revision. `x-nextjs-cache: HIT` is the smoking gun. |
| `/command-center` returns **404** instead of 307 | Same as above (cache) | Wait, retry. If still broken, confirm `middleware.ts` matcher. |
| Storage write fails with `AuthorizationFailure` | `az storage account show -n stjiehil2zaklu2 -g $rg --query "{publicNetworkAccess,allowSharedKeyAccess}"` | `publicNetworkAccess` got set back to `Disabled` (no PE = no path). Fix: `az storage account update --public-network-access Enabled`. |
| Easy Auth 500 on `/.auth/login/aad` | `az containerapp auth show -n ca-portal-…` | Token store enabled but storage SAS unavailable — keep `tokenStore.enabled: false` (already set). |
| Browser sees **CORS error** calling `/api/...` | Network tab — should be same-origin via proxy | `NEXT_PUBLIC_API_URL` is non-empty → browser hits API directly. Set it to empty in bicep + redeploy portal. |
| Header-spoofing test (`X-MS-Client-Principal` from browser) returns 200 | Proxy `BLOCKED_INBOUND_HEADER_PREFIXES` regression | Re-check `azure/portal/src/app/api/[...path]/route.ts`. |
| Child container doesn't start, Application Insights shows no logs | Replica scaled to zero | Normal until a request arrives. |

### Five bugs we already fixed (don't re-introduce)

1. **`tool.callback` vs `tool.handler`** — MCP SDK ≥ 1.29 stores the user
   handler at `_registeredTools[name].handler`. `mcp-base.ts` falls back to
   `callback` for older SDKs.
2. **Storage `publicNetworkAccess: Disabled` with no Private Endpoint**
   killed every child on boot. Bicep keeps it Enabled deliberately.
3. **`MCP_*_URL` using `http://`** caused Container Apps to 301 → HTTPS,
   which `fetch` follows with method downgrade POST → GET → 405.
   Bicep generates `https://` URLs.
4. **Easy Auth `tokenStore.enabled: true`** failed with
   "SasUrlSettingName for BlobStorage must be set" because shared-key access
   is off. Stays `false`.
5. **Master Agent v1 dispatch** shoved natural language into a `question`
   field, but most tool schemas expect structured args (`{ system: "..." }`).
   Replaced with a 2-tier OpenAI dispatch in `dispatchAskTool`.
6. **`position: fixed` modal nested inside a `position: sticky` parent** had
   half its surface area "click-through" to elements behind it (only the
   visually-overlapping fields were affected, the others worked normally).
   Cause: a `sticky` ancestor creates a containing block that re-anchors
   the descendant `fixed` element's pointer-event hit-testing even though
   the visual layout still appears viewport-anchored. **Fix:** every modal
   must `createPortal(jsx, document.body)` so it's hoisted out of any
   parent stacking context. See `azure/portal/src/components/ApplyModal.tsx`
   for the pattern.
7. **Easy Auth on a custom domain returned 401 on POSTs** even though
   pages rendered fine. Cause: without `httpSettings.forwardProxy.convention=Standard`
   on the auth config, Easy Auth always derived its OAuth callback from the
   original Azure FQDN — so a user on `www.nebula-forge.at` would sign in,
   the AppServiceAuthSession cookie would get bound to the *Azure* FQDN, and
   subsequent same-origin POSTs from `www.nebula-forge.at` had no cookie →
   no principal → API 401. **Fix:** set `httpSettings.forwardProxy.convention='Standard'`
   in `containerapp-portal.bicep` (or imperatively `az containerapp auth update --proxy-convention Standard`).
   Mandatory for every custom domain.

8. **`azd provision` rolled every container app back to the placeholder image**
   (`mcr.microsoft.com/k8se/quickstart:latest`). `azd deploy` had set the
   real ACR images, but the next `azd provision` re-applied the bicep
   template which hard-coded `image: placeholderImage` for every container.
   Symptoms: HR portal returned `Invalid proxy authentication`, chat returned
   401, all `/api/*` endpoints behaved unexpectedly because the running
   container was the platform quickstart, not our Express API.
   **Fix:** wired `SERVICE_<NAME>_IMAGE_NAME` (azd already tracks these per
   service) into bicep params, so each container's `image` is
   `!empty(serviceImageName) ? serviceImageName : placeholderImage`. The
   placeholder is now only used on the very first provision before any
   `azd deploy` has run. See `azure/infra/main.parameters.json` and the
   `param ...ImageName` block in `resources.bicep`.

---

## 5. Smoke tests

After any non-trivial change, run these in order:

```pwsh
$portal = (azd env get-value PORTAL_BASE_URL)

# 1. Landing reachable
curl.exe -s -o NUL -w "Landing: %{http_code}\n" -H "Accept: text/html" -H "User-Agent: Mozilla/5.0" "$portal/"

# 2. Careers reachable
curl.exe -s -o NUL -w "Careers: %{http_code}\n" -H "Accept: text/html" -H "User-Agent: Mozilla/5.0" "$portal/careers"

# 3. A specific job detail (SSG)
curl.exe -s -o NUL -w "Job:     %{http_code}\n" -H "Accept: text/html" -H "User-Agent: Mozilla/5.0" "$portal/careers/eng-001"

# 4. Auth gate
curl.exe -s -o NUL -w "CC gate: %{http_code}\n" -H "Accept: text/html" -H "User-Agent: Mozilla/5.0" "$portal/command-center"

# 5. API gate
curl.exe -s -o NUL -w "Chat 401:%{http_code}\n" -X POST "$portal/api/chat" -H "Content-Type: application/json" -d '{"message":"x"}'

# 6. Easy Auth flow
curl.exe -s -o NUL -w "Login:   %{http_code}\n" "$portal/.auth/login/aad?post_login_redirect_uri=/"
```

Expected: `200 200 200 307 401 302`.

For the live chat you have to use a browser (Easy Auth needs a browser
session). Send any message in `/command-center` and confirm it streams a
response. Then send a message that **routes** to a department (e.g.
"List all crew members on the roster") and confirm a department-coloured
tool pill appears above the bubble.

---

## 6. Common pitfalls we hit & how to avoid them

- **Don't change `unauthenticatedClientAction`** to `RedirectToLoginPage`
  unless you also remove the public landing page. The current
  `AllowAnonymous` + middleware gating is intentional.
- **Don't add new `/api/...` routes** to the API without also adding them to
  `ALLOWED_PATHS` in the proxy. Anything not on the allow-list 404s.
- **Don't forget to update bicep** when you change Container App env vars
  imperatively (`az containerapp update --set-env-vars …`). The next `azd
  provision` will revert your change.
- **Don't put long-lived secrets in env** as plain values. Use Container
  Apps secrets (`secretRef`) and let bicep declare them so `azd provision`
  doesn't wipe them.
- **Don't bump `softDeleteRetentionInDays`** on the Key Vault — it's
  immutable; you'll get a `BadRequest` and the deployment will fail.
- **Don't enable `tokenStore`** in Easy Auth — needs SAS-blob backing that
  our shared-key-disabled storage account can't provide.
- **Don't deploy the API without verifying** `AUTH_ENABLED=true` and the
  `proxy-shared-secret` is on **both** apps.
- **When a Next.js page returns 404 right after deploy**, wait 30 s before
  debugging — Container Apps' revision rollover briefly serves a stale
  `x-nextjs-cache: HIT` from the previous revision.

---

## 7. Defender for AI demo

The HR portal at `/hr/demo` ships 5 canned attack CVs. Each click submits a
deliberately malicious CV through the same screening pipeline a real
applicant uses. Azure OpenAI's content filter blocks the prompt (so it
shows up as `Status: Flagged` in `/hr/threats`) and **Microsoft Defender
for AI** raises the corresponding alert in **Defender for Cloud → Security
Alerts** (~15-30 min propagation).

| Demo CV | Target alert |
|---|---|
| Alex Mercer (system override + ChatML injection) | `AI.Azure_Jailbreak.ContentFiltering` |
| Sofia Reyes (DAN 13.0 jailbreak) | `AI.Azure_Jailbreak.ContentFiltering` |
| Tomáš Dvořák (credential / env-var theft) | `AI.Azure_CredentialTheftAttempt` |
| Priya Chakraborty (phishing / lookalike URLs) | `AI.Azure_MaliciousUrl.UserPrompt` |
| Marcus Lindqvist (LLM reconnaissance) | `AI.Azure_LLMReconnaissance` |

### Where to look

```pwsh
# Subscription-level Defender plans (AI workloads must be Standard)
az security pricing show -n AI --query "{name:name, tier:pricingTier}" -o json
```

Then in the Azure portal: **Defender for Cloud → Security alerts** filtered
on resource `oai-jiehil2zaklu2`. Alerts include the source IP, the prompt
that triggered the filter, and the affected Azure OpenAI deployment.

### Reset the demo data

`/hr/demo` and `/hr` both have a "Clean demo data" button that calls
`POST /api/applications/cleanup-demo` and removes every row with
`source='demo'`. Real (`source='web'`) submissions are preserved.

Direct SQL alternative (run as the developer AAD admin):

```sql
DELETE FROM candidates WHERE source = 'demo';
```

### Re-run the Postgres bootstrap (e.g., after a schema change)

```pwsh
# psql.exe must be on PATH
& "C:\Users\markus\Documents\Code\ThreatNinja Agents\azure\infra\postgres-bootstrap.ps1"
```

Idempotent — creates the table if missing, re-grants the MI role.

---

## 8. Decommissioning / costs

### Tear down everything

```pwsh
cd azure
azd down --purge --force
# Optionally remove the Entra app reg:
az ad app delete --id (azd env get-value AAD_CLIENT_ID)
```

`--purge` also purges the soft-deleted Key Vault. Without it the KV name
stays reserved for 7 days.

### What's costing money right now

- Container Apps Consumption: ~free at idle (children scale to 0) + ~few €/mo
  for portal + API min 1 replica
- **PostgreSQL Flexible Server (Burstable_B1ms)**: ~€12/mo + storage
- Azure OpenAI `gpt-4o-mini`: pay-per-token, GlobalStandard SKU 50 k TPM
  (HR pipeline = 2 calls per CV submission)
- Storage: a few cents (small Tables data)
- Log Analytics: 90-day retention, ~per-GB ingestion
- ACR Basic: ~5 €/mo
- Key Vault: free tier
- App Insights: free for low volume

Total expected: **~15–20 € per day** at our current usage (most of which is
the always-on PostgreSQL).
