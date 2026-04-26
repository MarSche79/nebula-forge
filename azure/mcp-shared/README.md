# Shared MCP Container Image

A single Dockerfile that can build any of the Nebula Forge MCP server images by
selecting the agent at build time via the `AGENT_NAME` build argument. The same
image layout is consumed by `azd` when provisioning Azure Container Apps.

## How it works

- Build context is the **repository root** (so the Dockerfile can `COPY` the
  workspace's `package.json`, `packages/shared/`, and every `agents/*/`).
- `--build-arg AGENT_NAME=<agent-folder>` controls which agent's `main.ts` the
  container runs.
- The container reads `PORT` (default `3000`) and `AZURE_STORAGE_ACCOUNT_NAME`
  to talk to real Azure Table Storage. Without `AZURE_STORAGE_ACCOUNT_NAME` it
  falls back to the local Azurite endpoint (intended for local dev only).
- Set `SEED_ON_START=true` to have the container call the agent's `seed()`
  function on boot before the HTTP server starts listening.

## Build manually

From the repository root:

```bash
docker build -f azure/mcp-shared/Dockerfile --build-arg AGENT_NAME=nebula-hr -t nebula-hr .
docker run -p 3000:3000 -e AZURE_STORAGE_ACCOUNT_NAME=mystorageaccount nebula-hr
```

To seed Azure Table Storage on first boot:

```bash
docker run -p 3000:3000 \
  -e AZURE_STORAGE_ACCOUNT_NAME=mystorageaccount \
  -e SEED_ON_START=true \
  nebula-hr
```

Valid `AGENT_NAME` values:

- `nebula-hr`
- `nebula-materials`
- `nebula-exploration`
- `nebula-science`
- `nebula-safety`
- `nebula-engineering`
- `nebula-logistics`
- `nebula-comms`
- `nebula-medbay`
