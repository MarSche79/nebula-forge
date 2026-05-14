import pg from "pg";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import { config } from "./config.js";

const { Pool } = pg;

const tokenProvider = getBearerTokenProvider(
  new DefaultAzureCredential({ managedIdentityClientId: process.env.AZURE_CLIENT_ID }),
  "https://ossrdbms-aad.database.windows.net/.default",
);

let _pool: pg.Pool | null = null;

export function isPostgresConfigured(): boolean {
  return config.postgres.enabled;
}

export function getPool(): pg.Pool {
  if (!_pool) {
    _pool = new Pool({
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: async () => tokenProvider(),
      ssl: { rejectUnauthorized: true },
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    _pool.on("error", (err) => console.warn("[pg] idle error:", err.message));
  }
  return _pool;
}
