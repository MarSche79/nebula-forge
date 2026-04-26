# 🚀 Nebula Forge — Deployment Guide

Step-by-step guide to deploy your Nebula Forge agents to Microsoft 365 Copilot (where they'll also appear in Copilot Studio).

---

## 📋 Prerequisites (one-time setup)

| What | Where | Why |
|------|-------|-----|
| **Node.js 22+** | https://nodejs.org | Run MCP servers |
| **VS Code** | https://code.visualstudio.com | Editor + tunnels |
| **Microsoft 365 Agents Toolkit** extension | VS Code Marketplace — search "Microsoft 365 Agents Toolkit" | Provisions the agent |
| **Microsoft 365 dev tenant** with Copilot license | https://developer.microsoft.com/microsoft-365/dev-program | Required to upload agents |
| **GitHub account** | https://github.com | For VS Code Dev Tunnel auth |

---

## PART A — Start the MCP Servers (local)

You only do this **once per session** — the servers need to be running while you use the agents.

### Step 1: Open a terminal in the project root
```powershell
cd "C:\Users\markus\Documents\Code\ThreatNinja Agents"
```

### Step 2: Start Azurite (Terminal 1 — keep open)
```powershell
npm run start:azurite
```
You should see: `Azurite Table service successfully started on 127.0.0.1:10002`

### Step 3: Seed the data (Terminal 2 — one-time)
```powershell
npm run seed
```
You should see `✅` messages for all 9 agents.

### Step 4: Start all MCP servers (Terminal 3 — keep open)
```powershell
npm run start:all
```
You should see all 9 servers listening on ports 3001–3009.

> ⚠️ **Keep Terminal 1 (Azurite) and Terminal 3 (MCP servers) running** for the rest of the workflow.

---

## PART B — Expose ONE Agent via Dev Tunnel

You need a public HTTPS URL because M365 Copilot can't reach `localhost`. Repeat this section **for each agent you want to deploy** (start with one to test).

We'll use **nebula-hr (port 3001)** as the example.

### Step 5: Open the Ports panel in VS Code
- VS Code → bottom panel → click **PORTS** tab (next to Terminal)
- If you don't see it: **View → Open View** → type "Ports"

### Step 6: Forward port 3001
- Click **Forward a Port**
- Enter `3001` and press Enter
- A row appears showing the local port and a forwarded address

### Step 7: Make the tunnel public
- **Right-click** the row → **Port Visibility → Public**
- (First time only: you'll be asked to sign in with GitHub or Microsoft)

### Step 8: Copy the tunnel URL
- Hover over the **Forwarded Address** column → click the copy icon
- The URL looks like `https://abc123-3001.use.devtunnels.ms`
- **Save this URL** — you need it in the next step

### Step 9: Verify the tunnel works
Open this URL in a browser (replace with your URL):
```
https://abc123-3001.use.devtunnels.ms/health
```
You should see JSON with `"status":"healthy"`.

---

## PART C — Update the Agent Package

### Step 10: Open the agent's ai-plugin.json
Open this file in VS Code:
```
C:\Users\markus\Documents\Code\ThreatNinja Agents\agents\nebula-hr\appPackage\ai-plugin.json
```

### Step 11: Replace the MCP URL
Find this block:
```json
"runtimes": [
  {
    "type": "MCP",
    "spec": {
      "url": "http://localhost:3001/mcp"   ← CHANGE THIS
    },
    ...
  }
]
```

Replace with **your tunnel URL** from Step 8 (keep the `/mcp` suffix):
```json
"url": "https://abc123-3001.use.devtunnels.ms/mcp"
```

Save the file.

---

## PART D — Provision the Agent with M365 Agents Toolkit

### Step 12: Open the agent in a NEW VS Code window
- **File → New Window**
- **File → Open Folder** → select `agents\nebula-hr` (just the agent's folder, not the whole monorepo)

> ⚠️ The Agents Toolkit expects to find `appPackage/` at the root of the opened folder.

### Step 13: Open the Agents Toolkit
- Click the **M365 Agents Toolkit** icon in the Activity Bar (left sidebar)
- Sign in with your **Microsoft 365 developer account** (top of the panel)

### Step 14: Provision
- In the Toolkit panel, find the **Lifecycle** section
- Click **Provision**
- Approve the prompts (it creates a Teams app ID and uploads the package)
- Wait for the green checkmark

If you get errors about missing files, the Toolkit may want a slightly different folder structure. Worst case: use **Create a New Agent/App → Declarative Agent → Start with an MCP server**, paste your tunnel URL, and copy the contents of `appPackage/declarativeAgent.json` and `instruction.txt` into the new project.

---

## PART E — Use Your Agent

### Step 15: Open Microsoft 365 Copilot
Browse to:
```
https://m365.cloud.microsoft/chat/
```
Sign in with the same M365 dev account.

### Step 16: Find your agent
- Look at the **left sidebar** under **Agents**
- You should see **"Nebula Forge HR Assistant"**
- Click it

### Step 17: Try a conversation starter
Type or click:
```
Show me the current crew roster
```

Copilot will call your local MCP server through the tunnel and respond with crew data!

### Step 18: View in Copilot Studio
- Browse to https://copilotstudio.microsoft.com
- Your agent will appear under **Agents** → **All agents**
- You can edit instructions, conversation starters, and connections from there

---

## 🔁 Repeat for Each Agent

For each remaining agent, repeat **PART B** (forward different port), **PART C** (edit that agent's `ai-plugin.json`), and **PART D** (provision):

| Agent | Folder | Port |
|-------|--------|------|
| nebula-materials | `agents\nebula-materials` | 3002 |
| nebula-exploration | `agents\nebula-exploration` | 3003 |
| nebula-science | `agents\nebula-science` | 3004 |
| nebula-safety | `agents\nebula-safety` | 3005 |
| nebula-engineering | `agents\nebula-engineering` | 3006 |
| nebula-logistics | `agents\nebula-logistics` | 3007 |
| nebula-comms | `agents\nebula-comms` | 3008 |
| nebula-medbay | `agents\nebula-medbay` | 3009 |

> 💡 **Tip:** Tunnels are persistent — once created, the same URL works across VS Code sessions.

---

## 🐛 Troubleshooting

| Problem | Fix |
|---------|-----|
| `EADDRINUSE: address already in use 127.0.0.1:10002` | Azurite is already running. Skip Step 2 or kill the process: `Get-NetTCPConnection -LocalPort 10002 \| %{ Stop-Process -Id $_.OwningProcess -Force }` |
| Tunnel returns 401 Unauthorized | Tunnel visibility isn't Public — repeat Step 7 |
| Agent doesn't appear in Copilot | Wait 1–2 minutes after Provision, then refresh the browser |
| "Responsible AI guidelines" error | Simplify `instruction.txt` — remove role-play language, use neutral wording |
| Tools not called | Enable debug mode: in the agent chat, type `-developer on` |

---

## 🎯 Quick Reference

```
┌─────────────────────────────────────────────────────────────┐
│  THE FLOW                                                    │
│                                                              │
│  1. Local MCP server (port 3001)                            │
│         ↓                                                    │
│  2. VS Code Dev Tunnel (https://...devtunnels.ms)           │
│         ↓                                                    │
│  3. Update appPackage/ai-plugin.json with tunnel URL        │
│         ↓                                                    │
│  4. M365 Agents Toolkit → Provision                         │
│         ↓                                                    │
│  5. Use in M365 Copilot OR edit in Copilot Studio           │
└─────────────────────────────────────────────────────────────┘
```
