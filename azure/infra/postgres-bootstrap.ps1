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
