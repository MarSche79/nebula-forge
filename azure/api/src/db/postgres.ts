import pg from "pg";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import { config } from "../config.js";

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
  if (!config.postgres.enabled) {
    throw new Error("Postgres is not configured (PSQL_HOST/PSQL_USER missing).");
  }
  if (_pool) return _pool;

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

  _pool.on("error", (err) => {
    console.warn("[pg] idle client error:", err.message);
  });
  return _pool;
}

export async function ping(): Promise<boolean> {
  if (!config.postgres.enabled) return false;
  try {
    const r = await getPool().query("SELECT 1 as ok");
    return r.rows?.[0]?.ok === 1;
  } catch (err) {
    console.warn("[pg] ping failed:", (err as Error).message);
    return false;
  }
}
