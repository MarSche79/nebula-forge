# 🌟 Nebula Forge Master Agent — Deployment Guide

The Master Agent acts as the **central concierge** for all 9 specialized Nebula Forge agents. It routes user questions to the right agent and serves as a fallback when users don't know who to ask.

## 📂 What's prepared

`Copilot-Studio-Clones/Nebula Forge Master Agent/` contains a full agent structure that matches the format of your already-uploaded agents:

```
Nebula Forge Master Agent/
├── agent.mcs.yml          ← Persona, instructions (lists all 9 agents), starters
├── agent.mcs.yaml         ← Duplicate (Copilot Studio uses both extensions)
├── settings.mcs.yml       ← Config (GenerativeActions enabled, AgentConnectable=true)
├── icon.png               ← "NF" Master icon (indigo + gold)
├── knowledge/files/
│   └── nasa-general.knowledge.yaml(+.mcs.yml)   ← Generic NASA reference
└── topics/                ← All standard system topics (Greeting, Escalate, etc.)
```

> ⚠️ The `schemaName` in `settings.mcs.yml` uses prefix `crdb9_`. **Replace it with whatever prefix your other agents use** (open one of your already-cloned agents' `settings.mcs.yml` and copy the prefix). Otherwise the upload will fail.

---

## 🚢 Deploy Steps

### Step 1: Create the blank agent in Copilot Studio
1. Go to https://copilotstudio.microsoft.com
2. Click **+ New agent** → **Skip to configure**
3. Name it exactly: **`Nebula Forge Master Agent`**
4. Click **Create**

### Step 2: Clone it down with the VS Code extension
1. In VS Code, open the **Copilot Studio** sidebar
2. Find the new "Nebula Forge Master Agent" → right-click → **Clone Agent**
3. Save it next to your other clones (in `Copilot-Studio-Clones/`)

### Step 3: Sync settings.mcs.yml prefix
1. Open the **freshly cloned** `Nebula Forge Master Agent/settings.mcs.yml`
2. Note the `schemaName` prefix (e.g. `crdb9_`)
3. Open the **prepared** `settings.mcs.yml` and ensure both lines use the same prefix:
   - `schemaName: <prefix>_NebulaForgeMasterAgent`
   - `defaultSchemaName: <prefix>_NebulaForgeMasterAgent.gpt.default`

### Step 4: Replace the cloned files with the prepared ones
1. Copy everything from the prepared folder into the cloned folder, **overwriting**:
   - `agent.mcs.yml`, `agent.mcs.yaml`, `settings.mcs.yml`, `icon.png`
   - `knowledge/files/*` (both .yaml and .yaml.mcs.yml files)
2. Keep the cloned `topics/` folder as-is (the prepared one has identical defaults)

### Step 5: Apply Changes
1. In the Copilot Studio extension panel, find the Master Agent
2. Click **Apply Changes** (or run `Copilot Studio: Apply Changes` from Command Palette)
3. Wait for the upload — should take 30–60 seconds

### Step 6: Connect the 9 child agents
The Master Agent uses **Generative Actions** — it can call other agents that are connected to it. Wire them up in the Copilot Studio web UI:

1. Open https://copilotstudio.microsoft.com → **Nebula Forge Master Agent**
2. Go to **Tools** (or **Agents**) → **+ Add a tool** → **Agent**
3. For each of the 9 agents, select:
   - Nebula Forge HR Assistant
   - Nebula Forge Material Analyst
   - Nebula Forge Exploration Navigator
   - Nebula Forge Science Officer
   - Nebula Forge Safety Officer
   - Nebula Forge Chief Engineer
   - Nebula Forge Quartermaster
   - Nebula Forge Communications Officer
   - Nebula Forge Medical Officer
4. Save

> The agents you uploaded already have `isAgentConnectable: true`, so they're ready to be picked up.

### Step 7: Test
1. Open the Master Agent's **Test** panel
2. Try a starter:
   - _"I have a question but I'm not sure who can help — can you point me to the right agent?"_
   - _"Who handles questions about radiation safety on the station?"_
3. The Master Agent should identify the relevant child agent and route the question.

---

## 🐛 Troubleshooting

| Problem | Fix |
|---------|-----|
| `Apply Changes` rejects schemaName | The prefix doesn't match your tenant. Open another agent's `settings.mcs.yml` and copy its prefix |
| Master Agent doesn't route to children | Make sure each child has `isAgentConnectable: true` (open their `settings.mcs.yml`) — yes by default if you uploaded ours |
| "Agent" option not in Tools menu | Generative Actions may not be on. In settings → Generative AI → ensure **Generative orchestration** is enabled |
| Routing decisions seem random | The instructions in `agent.mcs.yml` give explicit topic→agent mappings. Make sure the file uploaded successfully (check the agent's instructions in the web UI after Apply Changes) |
