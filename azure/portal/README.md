# Nebula Forge — Employee Portal

Next.js 15 + React 19 + Tailwind CSS portal for the Nebula Forge space station.

## Features

- 9 department cards backed by the agent fleet (`/api/agents`)
- Persistent floating chat widget (SSE streaming via `/api/chat`)
- Entra ID (MSAL.js) authentication — falls back to demo mode if not configured
- Light theme by default, dark mode toggle (persisted in `localStorage`)

## Local development

```bash
cd azure/portal
npm install
cp .env.example .env.local   # then edit
npm run dev
```

Open http://localhost:3000.

## Environment variables

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Backend base URL exposing `/api/chat`, `/api/me`, `/api/agents`, `/api/health`. |
| `NEXT_PUBLIC_ENTRA_TENANT_ID` | Entra tenant ID (leave blank to use `common`). |
| `NEXT_PUBLIC_ENTRA_CLIENT_ID` | Entra app registration (SPA) client ID. Leave blank to run in demo mode. |

## Production build

```bash
npm run build
npm start
```

The Dockerfile produces a standalone Next.js image suitable for Azure Container Apps.
