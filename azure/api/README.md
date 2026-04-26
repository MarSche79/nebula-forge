# Nebula Forge API

Backend API for the Nebula Forge Employee Portal.

## Architecture

- **Express + TypeScript** (ESM, Node 22).
- **Azure AI Foundry Agent Service** hosts a single **Master Agent** ("Nebula Forge Master Agent") that routes user questions to nine specialized child agents.
- Each child agent is implemented as a separate **MCP server** running as its own Azure Container App (HR, Materials, Exploration, Science, Safety, Engineering, Logistics, Comms, Medbay).
- The Master Agent exposes one `ask_<agent>` **function tool** per child. When invoked, the tool handler proxies the call through `src/agent/mcp-client.ts` to the matching MCP server's `/mcp` endpoint. (v1: a simple heuristic picks an MCP tool to call. Full LLM-driven sub-routing will land once Foundry supports MCP tools natively.)

## Endpoints

| Method | Path              | Description                                                       |
|--------|-------------------|-------------------------------------------------------------------|
| GET    | `/api/health`     | Liveness probe.                                                   |
| GET    | `/api/me`         | Returns the authenticated user (decoded from Entra ID JWT).       |
| GET    | `/api/agents`     | Lists the 9 child agents and pings each MCP `/health`.            |
| POST   | `/api/chat`       | `{ message, threadId? }` → SSE stream of the Master Agent reply.  |
| POST   | `/api/chat/reset` | Creates a new Foundry thread, returns `{ threadId }`.             |

### `/api/chat` SSE event types

- `thread` — `{ threadId }` emitted when a new thread is created.
- `tool`   — `{ name, args }` emitted when the Master Agent invokes a child agent.
- `delta`  — `{ text }` chunks of the final assistant message.
- `done`   — `{ threadId }` end-of-stream sentinel.
- `error`  — `{ message }` if anything failed.

## Local development

```bash
cd azure/api
npm install
cp .env.example .env   # if present, otherwise set vars manually
npm run dev
```

### Environment variables

| Var                            | Default                | Notes                                                    |
|--------------------------------|------------------------|----------------------------------------------------------|
| `PORT`                         | `3000`                 |                                                          |
| `PORTAL_ORIGIN`                | `*`                    | CORS origin for the Next.js portal.                      |
| `AUTH_ENABLED`                 | `true`                 | Set to `false` to bypass JWT validation in local dev.    |
| `AI_PROJECT_ENDPOINT`          | —                      | Azure AI Foundry project connection string / endpoint.   |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | `gpt-4o-mini`          | Model deployment used by the Master Agent.               |
| `ENTRA_TENANT_ID`              | —                      | Required when `AUTH_ENABLED=true`.                       |
| `ENTRA_CLIENT_ID`              | —                      | App registration client ID (token audience).             |
| `MCP_<AGENT>_URL`              | `http://localhost:30NN`| One per child agent: HR, MATERIALS, EXPLORATION, SCIENCE, SAFETY, ENGINEERING, LOGISTICS, COMMS, MEDBAY. |

When `AUTH_ENABLED=false`, all requests are authenticated as a fake local-dev user.

## Build & run

```bash
npm run build
npm start
```

## Docker

```bash
docker build -t nebula-forge-api .
docker run --rm -p 3000:3000 --env-file .env nebula-forge-api
```

## Notes

- The `@azure/ai-projects` SDK is in beta; `src/agent/foundry-client.ts` resolves the client constructor defensively so the API keeps compiling across SDK shape changes.
- The Master Agent is created on first use and re-used by name on subsequent boots.
