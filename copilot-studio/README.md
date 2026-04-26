# 🚀 Copilot Studio Deployment Guide

This is the **simplest path** to get your Nebula Forge agents into Microsoft Copilot Studio using the official VS Code extension. No tunnels, no MCP servers required.

---

## 📂 What's in `copilot-studio/`

```
copilot-studio/
├── nebula-hr/
│   ├── agent.mcs.yaml              ← Agent definition (name, description, instructions, starters)
│   ├── icon.png                    ← Agent icon
│   └── knowledge/files/
│       ├── shrm.knowledge.yaml     ← Public website knowledge source
│       └── nasa-astronauts.knowledge.yaml
├── nebula-materials/
│   └── ... (same structure)
└── ... (9 agents total)
```

Each agent has:
- ✅ Display name + description
- ✅ Persona instructions
- ✅ 4 conversation starters
- ✅ 2 public website knowledge sources (relevant to the agent's domain)
- ✅ Icon

---

## 🛠️ One-time Setup

### Step 1: Install the VS Code extension

1. Open **VS Code**
2. Go to **Extensions** (`Ctrl+Shift+X`)
3. Search for **"Microsoft Copilot Studio"**
4. Click **Install**

### Step 2: Sign in

1. Click the **Copilot Studio** icon in the Activity Bar (left sidebar)
2. Click **Sign in** and use your Microsoft Copilot Studio account
3. Select the **environment** you want to deploy to

> If you don't have a Copilot Studio environment yet, get a free trial at https://copilotstudio.microsoft.com

---

## 🚢 Deploy an Agent (do this for each of the 9)

### Step 3: Create a new agent in Copilot Studio (web)

The VS Code extension currently works by **cloning an existing agent**, then editing it locally. So:

1. Open https://copilotstudio.microsoft.com
2. Click **+ New agent** → **Skip to configure**
3. Set the name (e.g. `Nebula Forge HR Assistant`) — match the displayName in the YAML
4. Click **Create**

### Step 4: Clone it down to VS Code

1. In VS Code, open the **Copilot Studio** sidebar
2. You should now see your new agent in the list
3. **Right-click** the agent → **Clone Agent**
4. Choose a destination folder

### Step 5: Replace the cloned files with our prepared YAML

1. The clone created a folder like `<your-folder>/Nebula Forge HR Assistant/`
2. **Copy the contents** of `copilot-studio/nebula-hr/` over the cloned folder:
   - `agent.mcs.yaml` → replace the cloned version
   - `icon.png` → replace
   - `knowledge/files/*.yaml` → copy in
3. Save all files

### Step 6: Push back to Copilot Studio

1. In the Copilot Studio extension panel, find your agent
2. Click **Apply Changes** (or use Command Palette → `Copilot Studio: Apply Changes`)
3. Wait for the upload to complete

### Step 7: Use it!

1. Open https://copilotstudio.microsoft.com
2. Open your agent → **Test** panel
3. Try a conversation starter

---

## 🔁 Repeat for each agent

| # | Folder | Suggested name in Copilot Studio |
|---|--------|----------------------------------|
| 1 | `copilot-studio/nebula-hr/` | Nebula Forge HR Assistant |
| 2 | `copilot-studio/nebula-materials/` | Nebula Forge Material Analyst |
| 3 | `copilot-studio/nebula-exploration/` | Nebula Forge Exploration Navigator |
| 4 | `copilot-studio/nebula-science/` | Nebula Forge Science Officer |
| 5 | `copilot-studio/nebula-safety/` | Nebula Forge Safety Officer |
| 6 | `copilot-studio/nebula-engineering/` | Nebula Forge Chief Engineer |
| 7 | `copilot-studio/nebula-logistics/` | Nebula Forge Quartermaster |
| 8 | `copilot-studio/nebula-comms/` | Nebula Forge Communications Officer |
| 9 | `copilot-studio/nebula-medbay/` | Nebula Forge Medical Officer |

---

## 🐛 Troubleshooting

| Problem | Fix |
|---------|-----|
| YAML field rejected ("unknown property") | The schema may have evolved. Open the cloned agent.mcs.yaml as reference, then **manually copy** instructions / starters / description from our YAML into the canonical file |
| Knowledge source URL not crawled | Public website knowledge requires URLs to be reachable without auth. NASA/USGS sites should all work |
| Agent appears empty after Apply Changes | Refresh https://copilotstudio.microsoft.com — sometimes takes 30–60 seconds to propagate |
| Can't find Clone option | Make sure you're signed into the correct environment (top of Copilot Studio sidebar) |
| Want to use the MCP servers too | After the agent exists in Copilot Studio, add a **Tool** → **Model Context Protocol** → paste your tunnel URL (see DEPLOYMENT.md for the full MCP server flow) |

---

## 💡 Pro Tips

- **Start with one agent** (HR) end-to-end before doing the rest. This validates the workflow with your specific environment.
- The YAML format may differ slightly between Copilot Studio releases. If a field is rejected, the easy fix is to open the freshly-cloned `agent.mcs.yaml` (which is whatever your tenant currently expects), and **manually port over** the `displayName`, `description`, `instructions`, and `starters` values from our prepared file.
- The **knowledge sources** (`*.knowledge.yaml`) are the most likely to need adjustment — if the format is rejected, you can also add them through the Copilot Studio web UI: **Knowledge** → **Add knowledge** → **Public websites** and paste the URLs from our YAML.

---

## 📋 Knowledge Sources Quick Reference

| Agent | Knowledge Sources |
|-------|-------------------|
| HR | SHRM HR Best Practices, NASA Astronaut Selection |
| Materials | USGS Mineral Resources, NASA Astromaterials |
| Exploration | NASA Missions, ESA Space Exploration |
| Science | NASA Science, ScienceDaily Space News |
| Safety | NASA Safety Center, OSHA Workplace Safety |
| Engineering | NASA Technology, NASA Spinoff |
| Logistics | ASCM Supply Chain, NASA Logistics Reduction |
| Comms | NASA Deep Space Network, NASA SCaN Program |
| Medbay | NASA Human Research Program, Aerospace Medical Association |
