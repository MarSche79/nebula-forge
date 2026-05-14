// One-shot bootstrap: creates the `agents.*` schema in the NebulaForge
// Postgres Flex server using the developer's AAD token (no psql needed).

import { execSync } from "node:child_process";
import pg from "pg";

function getAzd(name) {
  const out = execSync("azd env get-values", { encoding: "utf8" });
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m && m[1] === name) return m[2];
  }
  return "";
}

const psqlHost = getAzd("PSQL_HOST");
const dbName = getAzd("PSQL_DATABASE");
const me = getAzd("DEVELOPER_PRINCIPAL_NAME");
const rg = getAzd("AZURE_RESOURCE_GROUP");
const serverName = psqlHost.split(".")[0];
const miName = "id-jiehil2zaklu2";

if (!psqlHost || !dbName || !me || !rg) {
  console.error("Missing azd env values:", { psqlHost, dbName, me, rg });
  process.exit(1);
}

console.log(`Server: ${psqlHost}`);
console.log(`Database: ${dbName}`);
console.log(`AAD admin: ${me}`);
console.log(`Runtime MI: ${miName}`);

console.log("\nFetching managed identity principalId...");
const miPrincipalId = execSync(
  `az identity show -n ${miName} -g ${rg} --query principalId -o tsv`,
  { encoding: "utf8" },
).trim();
if (!miPrincipalId) { console.error("MI principalId not found"); process.exit(1); }

console.log("\nFetching AAD access token for oss-rdbms...");
const token = execSync(
  `az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv`,
  { encoding: "utf8" },
).trim();
if (!token) { console.error("Failed to acquire AAD token"); process.exit(1); }

const sql = `
-- Existing candidates table (idempotent)
CREATE TABLE IF NOT EXISTS candidates (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    email           TEXT NOT NULL,
    job_id          TEXT NOT NULL,
    job_title       TEXT,
    department      TEXT NOT NULL,
    cv_text         TEXT,
    cover_note      TEXT,
    file_name       TEXT,
    status          TEXT NOT NULL DEFAULT 'New',
    match_score     INTEGER,
    recommendation  TEXT,
    interviewer_json TEXT,
    hr_manager_json  TEXT,
    threat_detected BOOLEAN NOT NULL DEFAULT FALSE,
    threat_types    TEXT,
    decision        TEXT,
    source          TEXT NOT NULL DEFAULT 'web',
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    screened_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_candidates_department ON candidates (department);
CREATE INDEX IF NOT EXISTS idx_candidates_submitted  ON candidates (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_status     ON candidates (status);
CREATE INDEX IF NOT EXISTS idx_candidates_source     ON candidates (source);
CREATE INDEX IF NOT EXISTS idx_candidates_threat     ON candidates (threat_detected) WHERE threat_detected = TRUE;
CREATE INDEX IF NOT EXISTS idx_candidates_dedupe     ON candidates (email, job_id, submitted_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${miName}') THEN
    EXECUTE format('CREATE ROLE %I WITH LOGIN', '${miName}');
  END IF;
END
$$;
SECURITY LABEL FOR "pgaadauth" ON ROLE "${miName}" IS 'aadauth,oid=${miPrincipalId},type=service';

GRANT CONNECT ON DATABASE "${dbName}" TO "${miName}";
GRANT USAGE ON SCHEMA public TO "${miName}";
GRANT SELECT, INSERT, UPDATE, DELETE ON candidates TO "${miName}";

-- ============================================================
-- Agent army (Kanban board + activity feed)
-- ============================================================
CREATE SCHEMA IF NOT EXISTS agents;

CREATE TABLE IF NOT EXISTS agents.agent (
    id              TEXT PRIMARY KEY,
    display_name    TEXT NOT NULL,
    description     TEXT NOT NULL,
    mcp_url         TEXT,
    default_tool    TEXT NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS agents.task (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    body            TEXT,
    agent_id        TEXT REFERENCES agents.agent(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'backlog'
                    CHECK (status IN ('backlog','in_progress','blocked','done')),
    priority        INT  NOT NULL DEFAULT 2,
    source          TEXT NOT NULL DEFAULT 'user',
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_at          TIMESTAMPTZ,
    last_result     JSONB
);

CREATE TABLE IF NOT EXISTS agents.activity (
    id              BIGSERIAL PRIMARY KEY,
    task_id         UUID REFERENCES agents.task(id) ON DELETE SET NULL,
    agent_id        TEXT NOT NULL,
    surface         TEXT NOT NULL,
    action          TEXT NOT NULL,
    detail          JSONB NOT NULL DEFAULT '{}'::jsonb,
    external_url    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agents_task_status_pri  ON agents.task (status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_agents_task_agent       ON agents.task (agent_id);
CREATE INDEX IF NOT EXISTS idx_agents_activity_agent   ON agents.activity (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agents_activity_task    ON agents.activity (task_id);

INSERT INTO agents.agent (id, display_name, description, default_tool) VALUES
  ('scribe',    'Nebula Scribe',    'Drafts documents and publishes them to SharePoint via the agentops Power Automate flow.', 'autonomous_tick'),
  ('herald',    'Pulsar Herald',    'Posts crew updates and CC-trigger phrases into the Nebula Forge agent Teams channel.',     'autonomous_tick'),
  ('sentinel',  'Quasar Sentinel',  'Opens compliance investigations and applies Purview sensitivity labels.',                   'autonomous_tick'),
  ('auditor',   'Astra Auditor',    'Emits synthetic Defender / Entra audit signals into a Log Analytics custom table.',         'autonomous_tick'),
  ('whisperer', 'Void Whisperer',   'Continuously fires adversarial prompts at the demo OpenAI endpoint to keep Defender for AI alerts flowing.', 'autonomous_tick')
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  default_tool = EXCLUDED.default_tool;

GRANT USAGE ON SCHEMA agents TO "${miName}";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA agents TO "${miName}";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA agents TO "${miName}";
ALTER DEFAULT PRIVILEGES IN SCHEMA agents GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${miName}";
ALTER DEFAULT PRIVILEGES IN SCHEMA agents GRANT USAGE, SELECT ON SEQUENCES TO "${miName}";
`;

const { Pool } = pg;
const pool = new Pool({
  host: psqlHost, port: 5432, database: dbName, user: me, password: token,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const client = await pool.connect();
  try {
    console.log("\nExecuting schema migration...");
    await client.query(sql);
    const r = await client.query("SELECT count(*)::int AS n FROM agents.agent");
    console.log(`\nDone. agents.agent rows: ${r.rows[0].n}`);
    const tasksTable = await client.query("SELECT to_regclass('agents.task') AS t");
    console.log(`agents.task exists: ${tasksTable.rows[0].t !== null}`);
  } finally {
    client.release();
    await pool.end();
  }
})().catch((err) => { console.error("FAILED:", err); process.exit(1); });
