# Power Automate flow templates

These are **template definitions** for the four flows the new agents call.
You import them once, signed-in as the **agentops service account** mailbox,
so Teams/SharePoint actions appear as a real crew member.

| File | Purpose | Webhook env var the agents read |
|---|---|---|
| `pa-teams-post-message.flow.json`   | POST → "Post in chat or channel" (as the user) | `PA_TEAMS_WEBHOOK` |
| `pa-purview-cc-trigger.flow.json`   | POST → same Teams action with CC-trigger phrasing | `PA_CC_WEBHOOK` |
| `pa-sharepoint-create-doc.flow.json`| POST → "Create file" in NebulaForgeAgentSharePoint | `PA_SP_CREATE_WEBHOOK` |
| `pa-sharepoint-apply-label.flow.json`| POST → "Update file properties / apply sensitivity label" | `PA_SP_LABEL_WEBHOOK` |

**Import procedure** is in `MANUAL-SETUP.md` step 3. After creating each flow you
copy the HTTP trigger URL into Key Vault using:

```pwsh
azd env set PA_TEAMS_WEBHOOK      '<url-from-flow>'
azd env set PA_CC_WEBHOOK         '<url-from-flow>'
azd env set PA_SP_CREATE_WEBHOOK  '<url-from-flow>'
azd env set PA_SP_LABEL_WEBHOOK   '<url-from-flow>'
azd provision
```

The `azd provision` re-run wires the URLs as Container App secrets on each agent.

The `.flow.json` files are intentionally simple — one HTTP trigger + one connector
action. They are easier to inspect & re-create by hand than full solution `.zip`
exports, and they avoid coupling the demo to a specific Power Platform environment ID.
