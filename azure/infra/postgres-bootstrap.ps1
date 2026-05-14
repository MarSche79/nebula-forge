<#
.SYNOPSIS
  One-shot Postgres bootstrap for the HR screening pipeline.
.DESCRIPTION
  1. Assigns the developer as the Postgres AAD administrator (with retry —
     the data plane needs a moment to come up after the server is created).
  2. Connects as that admin, creates the `candidates` table + indexes, and
     grants table-level CRUD to the runtime managed identity. Idempotent.

  Run this exactly once after `azd provision` first creates the server,
  and any time the schema changes.
.NOTES
  Requirements:
    - psql.exe on PATH  (https://www.postgresql.org/download/windows/)
    - You are signed in as the AAD admin user via `az login`.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# ----- 0. Locate psql -----
$psql = Get-Command psql.exe -ErrorAction SilentlyContinue
if (-not $psql) {
    Write-Error "psql.exe not found on PATH. Install from https://www.postgresql.org/download/windows/ (Command Line Tools is enough)."
    exit 1
}

# ----- 1. Read deployment outputs from azd -----
Push-Location "$PSScriptRoot\.."
$envValues = @{}
foreach ($line in (azd env get-values 2>$null)) {
    if ($line -match '^([A-Z0-9_]+)="?(.*?)"?$') { $envValues[$Matches[1]] = $Matches[2] }
}
Pop-Location

$psqlHost  = $envValues['PSQL_HOST']
$dbName    = $envValues['PSQL_DATABASE']
$miName    = 'id-jiehil2zaklu2'   # runtime MI display name (= postgres role name)
$rg        = $envValues['AZURE_RESOURCE_GROUP']

if (-not $psqlHost) { throw 'PSQL_HOST not set in azd env. Run `azd provision` first.' }
if (-not $dbName)   { throw 'PSQL_DATABASE not set in azd env.' }
if (-not $rg)       { throw 'AZURE_RESOURCE_GROUP not set in azd env.' }

$serverName = $psqlHost.Split('.')[0]

# ----- 2. Get my (developer) principal info from azd env -----
$me            = $envValues['DEVELOPER_PRINCIPAL_NAME']
$mePrincipalId = $envValues['DEVELOPER_PRINCIPAL_ID']
if (-not $me)            { throw 'DEVELOPER_PRINCIPAL_NAME not set in azd env.' }
if (-not $mePrincipalId) { throw 'DEVELOPER_PRINCIPAL_ID not set in azd env.' }

# ----- 3. Get MI principalId (used in pgaadauth_create_principal_with_oid) -----
$miPrincipalId = az identity show -n $miName -g $rg --query principalId -o tsv
if (-not $miPrincipalId) { throw "Could not find managed identity '$miName' in '$rg'." }

# ----- 4. Make sure the developer is the Postgres AAD admin (idempotent + retry) -----
Write-Host "Ensuring AAD admin '$me' on server '$serverName' ..." -ForegroundColor Cyan
$existing = az postgres flexible-server microsoft-entra-admin list `
    --resource-group $rg --server-name $serverName `
    --query "[?objectId=='$mePrincipalId'].objectId | [0]" -o tsv 2>$null
if ($existing -eq $mePrincipalId) {
    Write-Host "  already configured." -ForegroundColor DarkGray
} else {
    $maxAttempts = 6
    for ($i = 1; $i -le $maxAttempts; $i++) {
        $err = az postgres flexible-server microsoft-entra-admin create `
            --resource-group $rg `
            --server-name $serverName `
            --object-id $mePrincipalId `
            --display-name $me `
            --type User 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  done." -ForegroundColor Green
            break
        }
        if ($err -match 'NotAccessible' -or $err -match 'not in an accessible state') {
            $sleepFor = [Math]::Min(60, 10 * $i)
            Write-Host ("  attempt {0}/{1}: server not accessible yet, sleeping {2}s..." -f $i, $maxAttempts, $sleepFor) -ForegroundColor Yellow
            Start-Sleep -Seconds $sleepFor
            continue
        }
        Write-Error "  failed: $err"
        exit 1
    }
}

# ----- 5. Get an AAD access token for Postgres -----
Write-Host "Connecting to $psqlHost/$dbName as $me ..." -ForegroundColor Cyan
$token = az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv
if (-not $token) { throw 'Failed to acquire AAD token for oss-rdbms.' }

# ----- 6. Build the SQL -----
$sql = @"
-- Schema (idempotent)
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
    source          TEXT NOT NULL DEFAULT 'web',  -- 'web' | 'demo' (excluded from KPIs by default)
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    screened_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_candidates_department  ON candidates (department);
CREATE INDEX IF NOT EXISTS idx_candidates_submitted   ON candidates (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_status      ON candidates (status);
CREATE INDEX IF NOT EXISTS idx_candidates_source      ON candidates (source);
CREATE INDEX IF NOT EXISTS idx_candidates_threat      ON candidates (threat_detected) WHERE threat_detected = TRUE;
CREATE INDEX IF NOT EXISTS idx_candidates_dedupe      ON candidates (email, job_id, submitted_at DESC);

-- Map the user-assigned managed identity to a Postgres role.
-- We use the raw approach (CREATE ROLE + SECURITY LABEL) because the helper
-- function name and signature varies between Flexible Server versions.
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$miName') THEN
    EXECUTE format('CREATE ROLE %I WITH LOGIN', '$miName');
  END IF;
END
`$`$;

SECURITY LABEL FOR "pgaadauth" ON ROLE "$miName" IS 'aadauth,oid=$miPrincipalId,type=service';

-- Least-privileged grants for the runtime role (no DDL).
GRANT CONNECT ON DATABASE "$dbName" TO "$miName";
GRANT USAGE ON SCHEMA public TO "$miName";
GRANT SELECT, INSERT, UPDATE, DELETE ON candidates TO "$miName";

-- ============================================================
-- Agent army (Kanban board + activity feed) — added 2026-05.
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

-- Seed the 5 new agents (idempotent — display_name kept up to date on conflict).
INSERT INTO agents.agent (id, display_name, description, default_tool) VALUES
  ('scribe',    'Nebula Scribe',    'Drafts documents and publishes them to SharePoint via the agentops Power Automate flow.',     'autonomous_tick'),
  ('herald',    'Pulsar Herald',    'Posts crew updates and CC-trigger phrases into the Nebula Forge agent Teams channel.',         'autonomous_tick'),
  ('sentinel',  'Quasar Sentinel',  'Opens compliance investigations and applies Purview sensitivity labels.',                       'autonomous_tick'),
  ('auditor',   'Astra Auditor',    'Emits synthetic Defender / Entra audit signals into a Log Analytics custom table.',             'autonomous_tick'),
  ('whisperer', 'Void Whisperer',   'Continuously fires adversarial prompts at the demo OpenAI endpoint to keep Defender for AI alerts flowing.', 'autonomous_tick')
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  default_tool = EXCLUDED.default_tool;

GRANT USAGE ON SCHEMA agents TO "$miName";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA agents TO "$miName";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA agents TO "$miName";
ALTER DEFAULT PRIVILEGES IN SCHEMA agents GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "$miName";
ALTER DEFAULT PRIVILEGES IN SCHEMA agents GRANT USAGE, SELECT ON SEQUENCES TO "$miName";

-- ============================================================
-- NebulaGPT — internal Threat Ninja assistant (Phase 2)
-- ============================================================
CREATE SCHEMA IF NOT EXISTS gpt;

CREATE TABLE IF NOT EXISTS gpt.session (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_oid    TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT 'New chat',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gpt.message (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id   UUID NOT NULL REFERENCES gpt.session(id) ON DELETE CASCADE,
    role         TEXT NOT NULL CHECK (role IN ('user','assistant','tool')),
    content      TEXT NOT NULL,
    citations    JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gpt.upload (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_oid        TEXT NOT NULL,
    file_name       TEXT NOT NULL,
    size            INT  NOT NULL DEFAULT 0,
    content_type    TEXT NOT NULL DEFAULT '',
    sharepoint_url  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gpt_session_user_updated ON gpt.session (user_oid, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_gpt_message_session      ON gpt.message (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gpt_upload_user          ON gpt.upload (user_oid, created_at DESC);

GRANT USAGE ON SCHEMA gpt TO "$miName";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA gpt TO "$miName";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA gpt TO "$miName";
ALTER DEFAULT PRIVILEGES IN SCHEMA gpt GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "$miName";
ALTER DEFAULT PRIVILEGES IN SCHEMA gpt GRANT USAGE, SELECT ON SEQUENCES TO "$miName";
"@

$tmp = New-TemporaryFile
$sqlFile = "$($tmp.FullName).sql"
Move-Item $tmp $sqlFile -Force
Set-Content -Path $sqlFile -Value $sql -Encoding UTF8

# ----- 7. Run psql -----
$env:PGPASSWORD = $token
try {
    & psql.exe `
        --host=$psqlHost `
        --port=5432 `
        --username=$me `
        --dbname=$dbName `
        --no-password `
        --set=sslmode=require `
        --file=$sqlFile
    if ($LASTEXITCODE -ne 0) { throw "psql exited with $LASTEXITCODE" }
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item $sqlFile -Force -ErrorAction SilentlyContinue
}

Write-Host "`nBootstrap complete. The runtime MI ($miName) has SELECT/INSERT/UPDATE/DELETE on candidates." -ForegroundColor Green
