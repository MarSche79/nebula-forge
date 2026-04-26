# Nebula Forge — Azure Deployment

> Deploy the entire Nebula Forge Employee Portal to your Azure subscription with one command.

This folder contains everything needed to deploy Nebula Forge to Azure using the
[Azure Developer CLI](https://learn.microsoft.com/azure/developer/azure-developer-cli/) (`azd`):

- `infra/` — Bicep IaC (resource group scoped)
- `mcp-shared/Dockerfile` — base image used by all 9 MCP servers
- `api/` — Foundry-orchestrator backend
- `portal/` — Next.js frontend
- `scripts/` — post-deploy helpers (Entra app, role grants, seeding, smoke tests)
- `azure.yaml` — `azd` service map

---

## 🏗️ Architecture

```
                          ┌────────────────────────────────────┐
                          │              Entra ID              │
                          │  App Registration + Enterprise App │
                          └────────────────┬───────────────────┘
                                           │ OIDC
                                           ▼
   Browser ──────────►  ┌──────────────────────────────┐
                        │  Portal (Next.js)            │
                        │  Container App               │
                        └──────────────┬───────────────┘
                                       │ HTTPS
                                       ▼
                        ┌──────────────────────────────┐
                        │  Backend API                 │
                        │  Container App (Foundry      │
                        │  orchestrator + agents)      │◄────┐
                        └─────┬────────────────────┬───┘     │
                              │                    │         │
                       MCP    │                    │  uses   │
                              ▼                    ▼         │
   ┌─────────────────────────────────────────────────┐       │
   │  9 MCP Container Apps (scale-to-zero)           │       │
   │  identity · directory · hr · finance · it       │       │
   │  facilities · travel · learning · comms         │       │
   └────────────────┬────────────────────────────────┘       │
                    │                                        │
                    ▼                                        │
       ┌──────────────────────────┐    ┌────────────────────┴───────┐
       │ Storage Account (Tables) │    │ Azure OpenAI (gpt-4o-mini) │
       │ replaces local Azurite   │    │ + AI Foundry Hub + Project │
       └──────────────────────────┘    └────────────────────────────┘

                    All resources stream logs/metrics to:
                  ┌──────────────────────────────────────┐
                  │ Log Analytics + Application Insights │
                  └──────────────────────────────────────┘
```

All container apps run inside a single **Container Apps Environment** with
images served from a private **Azure Container Registry**.

---

## 📋 What gets deployed

| Resource | Purpose | Approx. cost |
|---|---|---|
| Container Apps Environment | Hosts all containers | included |
| Container Registry (Basic) | Stores images | $5/month |
| 9 MCP Container Apps | Per-domain agent servers | ~$10/month (scale to zero) |
| Backend API Container App | Foundry orchestrator | ~$5/month |
| Portal Container App | Next.js frontend | ~$5/month |
| Storage Account (Tables) | Replaces Azurite | $1/month |
| Azure OpenAI (gpt-4o-mini) | LLM | usage-based |
| AI Foundry Hub + Project | Agent runtime | included |
| Log Analytics + App Insights | Monitoring | $5/month |
| Entra ID App registration | Auth | free |
| **Total estimate** | | **~$30–50/month + LLM usage** |

> Costs are rough monthly estimates for a low-traffic dev/demo workload in
> **westeurope**. Real costs depend heavily on LLM token usage and request volume.

---

## 🚀 Quick deploy

### Prerequisites

- An Azure subscription where you are **Owner** (or **Contributor** + **User Access Administrator**)
- [Azure Developer CLI](https://aka.ms/azd-install) — `winget install microsoft.azd`
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) — `winget install Microsoft.AzureCLI`
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — running locally (used to build images)
- Node.js **22+** — `winget install OpenJS.NodeJS.LTS`
- PowerShell 7+ (for the helper scripts under `scripts/`)

### 1. Login

```bash
azd auth login
az login
```

If you have multiple subscriptions, set the active one:

```bash
az account set --subscription "<subscription-id>"
```

### 2. Initialize the environment

```bash
cd azure
azd env new nebula-forge-prod
azd env set AZURE_LOCATION westeurope
```

You can pick any environment name; `nebula-forge-prod` is just a suggestion.
Re-running `azd env new <name>` later lets you spin up additional environments
(e.g. `nebula-forge-dev`).

### 3. (Optional) Configure parameters

The Bicep templates expose a few knobs through `azd env set`. The most common:

```bash
# Defaults shown — only set if you want to override
azd env set AZURE_LOCATION              westeurope
azd env set OPENAI_MODEL_NAME           gpt-4o-mini
azd env set OPENAI_MODEL_CAPACITY       50      # K TPM
azd env set CONTAINER_APP_MIN_REPLICAS  0
azd env set CONTAINER_APP_MAX_REPLICAS  3
```

Secrets (e.g. third-party API keys) should be added to the azd environment as well —
they will be wired into Container Apps as secret references:

```bash
azd env set MY_THIRD_PARTY_KEY "<value>" --secret
```

### 4. Deploy

```bash
azd up
```

This will:

- Provision all Azure resources (~10 min)
- Build and push Docker images to ACR (~5 min)
- Deploy services to Container Apps (~3 min)
- Print the **Portal URL** at the end

### 5. Create the Entra ID app registration

The deployment is up, but auth is not configured yet. Run:

```powershell
./scripts/create-entra-app.ps1
```

This script (provided by another agent) creates an app registration, sets the
redirect URI to your portal URL, and writes `AZURE_CLIENT_ID` /
`AZURE_TENANT_ID` / `AZURE_CLIENT_SECRET` into the azd environment.

Then redeploy the API + portal so they pick up the new auth env vars:

```bash
azd deploy api
azd deploy portal
```

### 6. Grant Foundry roles

Bicep can't reliably assign data-plane roles on the AI Foundry project /
OpenAI account because the API container app's managed identity principal
isn't known at template-evaluation time. Run this once after deploy:

```powershell
./scripts/grant-foundry-roles.ps1
```

It assigns:

- **Azure AI Developer** on the AI Foundry project
- **Cognitive Services OpenAI User** on the Azure OpenAI account

…to the API container app's system-assigned managed identity.

> Role propagation can take up to 5 minutes before the API can call Foundry.

### 7. Seed initial data

```powershell
./scripts/seed-azure.ps1
```

By default this calls each MCP's `/seed` HTTP endpoint. To seed by toggling
`SEED_ON_START=true` and restarting each container app instead:

```powershell
./scripts/seed-azure.ps1 -Method restart
```

### 8. Visit your portal!

```bash
azd env get-values | grep PORTAL_URL
```

(or on PowerShell: `azd env get-values | Select-String PORTAL_URL`)

---

## 👥 Add the Enterprise App to MyApplications

So users can launch Nebula Forge from <https://myapplications.microsoft.com>:

1. Go to **Microsoft Entra admin center** → **Identity** → **Applications** → **Enterprise applications**.
2. Find the app created by `create-entra-app.ps1` (named `Nebula Forge` by default).
3. Open **Properties** and set:
   - **Enabled for users to sign-in** → **Yes**
   - **Visible to users** → **Yes**
   - **Homepage URL** → your portal URL (from `azd env get-values`)
   - Upload a logo if you have one.
4. Open **Users and groups** → **Add user/group** and assign the users (or a group) that should see the app.
5. Open **Single sign-on** → confirm OIDC is configured (it should be, from `create-entra-app.ps1`).
6. The app will appear in the assigned users' **My Apps** portal within a few minutes.

---

## 🧪 Smoke test

```powershell
./scripts/test-deployment.ps1
```

Pings the portal, the API `/api/health` endpoint, and each MCP's `/health` endpoint.
Prints a results table and exits non-zero on any failure.

---

## 🛠️ Troubleshooting

### `azd up` fails on role assignment with `AuthorizationFailed`
Your account needs **User Access Administrator** (or **Owner**) on the
subscription. Either elevate, or have a subscription owner run `azd up` once.

### Container apps stuck in `Provisioning` or `Failed`
Stream the logs:
```bash
az containerapp logs show -n ca-api -g <resource-group> --follow
```
The most common cause is the image failing to start because an env var is
missing — re-run `azd deploy <service>` after fixing the azd env.

### API returns 500 with `Unauthorized` calling Foundry / OpenAI
You probably haven't run `./scripts/grant-foundry-roles.ps1` yet, or role
propagation hasn't completed — wait ~5 minutes and retry.

### Portal returns 401 / redirects to Microsoft login then errors
The Entra app registration's **Redirect URI** doesn't match the portal URL.
Re-run `./scripts/create-entra-app.ps1` (it's idempotent) or fix the redirect
URI manually in the Entra admin center, then `azd deploy portal`.

### Docker build fails: `Cannot connect to the Docker daemon`
Start Docker Desktop and wait for the whale icon to be steady, then re-run
`azd up`.

### `azd env get-values` shows blank URLs
The Bicep outputs ran but `azd` hasn't been refreshed. Run:
```bash
azd env refresh
```

### MCP container apps cold-start slowly
They scale to zero by default. Set a higher floor if needed:
```bash
azd env set CONTAINER_APP_MIN_REPLICAS 1
azd deploy
```

### I changed Bicep but `azd up` says "no changes"
Force a re-provision:
```bash
azd provision --no-prompt
```

---

## 🧹 Cleanup

```bash
azd down --purge
```

`--purge` also removes soft-deleted resources (Key Vault, OpenAI account)
so you can redeploy with the same names immediately.
