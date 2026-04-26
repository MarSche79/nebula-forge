<#
.SYNOPSIS
    Diagnose the Nebula Forge API container app.
.DESCRIPTION
    Runs a series of checks against the deployed API container app and
    writes everything (results + container logs + revision info + env vars)
    to azure/scripts/diagnose-output.log so the agent can read it back.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'

$logFile = Join-Path $PSScriptRoot 'diagnose-output.log'
if (Test-Path $logFile) { Remove-Item $logFile -Force }

function Log {
    param([string]$Text)
    Write-Host $Text
    Add-Content -LiteralPath $logFile -Value $Text
}

function Section {
    param([string]$Title)
    Log ""
    Log "============================================================"
    Log "  $Title"
    Log "============================================================"
}

Log "Nebula Forge API Diagnostic - $(Get-Date -Format 'u')"

# ---- Load azd env ----
Section "azd environment"
$envValues = @{}
$raw = azd env get-values 2>$null
foreach ($line in $raw) {
    if ($line -match '^([A-Z0-9_]+)="?(.*?)"?$') {
        $envValues[$Matches[1]] = $Matches[2]
    }
}
$rg    = $envValues['AZURE_RESOURCE_GROUP']
$subId = $envValues['AZURE_SUBSCRIPTION_ID']
Log "AZURE_RESOURCE_GROUP   = $rg"
Log "AZURE_SUBSCRIPTION_ID  = $subId"
Log "API_BASE_URL           = $($envValues['API_BASE_URL'])"
Log "PORTAL_BASE_URL        = $($envValues['PORTAL_BASE_URL'])"
Log "AI_PROJECT_ENDPOINT    = $($envValues['AI_PROJECT_ENDPOINT'])"
Log "AZURE_OPENAI_ENDPOINT  = $($envValues['AZURE_OPENAI_ENDPOINT'])"

if (-not $rg) { Log "FATAL: AZURE_RESOURCE_GROUP not set"; exit 1 }
az account set --subscription $subId | Out-Null

# ---- Discover API app ----
Section "API container app discovery"
$apiApp = az containerapp list -g $rg --query "[?starts_with(name, 'ca-api-')].name | [0]" -o tsv
Log "API container app: $apiApp"
if (-not $apiApp) { Log "FATAL: no ca-api-* container app found"; exit 1 }

# ---- Revisions ----
Section "Revisions"
$revsJson = az containerapp revision list -n $apiApp -g $rg -o json
$revs = $revsJson | ConvertFrom-Json
foreach ($r in $revs) {
    Log ("- {0}" -f $r.name)
    Log ("    active   = {0}" -f $r.properties.active)
    Log ("    traffic  = {0}" -f $r.properties.trafficWeight)
    Log ("    state    = {0}" -f $r.properties.runningState)
    Log ("    replicas = {0}" -f $r.properties.replicas)
    Log ("    created  = {0}" -f $r.properties.createdTime)
    Log ("    health   = {0}" -f $r.properties.healthState)
}

# ---- Active revision env ----
Section "Active revision env vars"
$envTable = az containerapp show -n $apiApp -g $rg --query "properties.template.containers[0].env" -o json | ConvertFrom-Json
foreach ($e in $envTable) {
    $val = if ($e.value) { $e.value } elseif ($e.secretRef) { "(secret: $($e.secretRef))" } else { "" }
    Log ("  {0,-40} = {1}" -f $e.name, $val)
}

# ---- Active revision compute / scale ----
Section "Container app config"
$ca = az containerapp show -n $apiApp -g $rg -o json | ConvertFrom-Json
Log "  Ingress external      = $($ca.properties.configuration.ingress.external)"
Log "  Ingress targetPort    = $($ca.properties.configuration.ingress.targetPort)"
Log "  Ingress fqdn          = $($ca.properties.configuration.ingress.fqdn)"
Log "  ActiveRevisionsMode   = $($ca.properties.configuration.activeRevisionsMode)"
Log "  Min replicas          = $($ca.properties.template.scale.minReplicas)"
Log "  Max replicas          = $($ca.properties.template.scale.maxReplicas)"
Log "  Provisioning state    = $($ca.properties.provisioningState)"
Log "  Running status        = $($ca.properties.runningStatus)"
Log "  Latest revision name  = $($ca.properties.latestRevisionName)"
Log "  Latest revision FQDN  = $($ca.properties.latestRevisionFqdn)"

# ---- Probe tests ----
Section "HTTP probes"
$apiFqdn = $ca.properties.configuration.ingress.fqdn

function Probe {
    param([string]$Label, [string]$Url, [string]$Method = 'GET', [string]$Body = $null)
    Log ""
    Log "  [$Method] $Url   ($Label)"
    try {
        $params = @{
            Uri = $Url; Method = $Method; UseBasicParsing = $true
            TimeoutSec = 30; ErrorAction = 'Stop'
        }
        if ($Body) {
            $params.Body = $Body
            $params.ContentType = 'application/json'
        }
        $r = Invoke-WebRequest @params
        Log "    -> $($r.StatusCode)"
        $content = $r.Content
        if ($content.Length -gt 1500) { $content = $content.Substring(0, 1500) + '... [truncated]' }
        Log "    body: $content"
    } catch {
        $resp = $_.Exception.Response
        if ($resp) {
            $code = [int]$resp.StatusCode
            $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
            $body = $reader.ReadToEnd()
            if ($body.Length -gt 1500) { $body = $body.Substring(0, 1500) + '... [truncated]' }
            Log "    -> HTTP $code"
            Log "    body: $body"
        } else {
            Log "    -> network error: $($_.Exception.Message)"
        }
    }
}

Probe "API health"  "https://$apiFqdn/api/health"
Probe "API agents"  "https://$apiFqdn/api/agents"
# /api/chat now requires the shared proxy secret + Easy Auth principal headers,
# so we don't probe it directly here. Test it through the portal (which signs in
# users via Easy Auth) instead.

# Portal proxy
$portalUrl = $envValues['PORTAL_BASE_URL']
if ($portalUrl) {
    $pu = $portalUrl.TrimEnd('/')
    Probe "Portal proxy /api/health (browser-style)" "$pu/api/health"
    Log ""
    Log "  NOTE: Unauthenticated browser requests should be redirected to"
    Log "        Microsoft Entra (302). curl above sends Accept: */* which"
    Log "        Easy Auth treats as a non-browser client and returns 401."
}

# ---- Container logs ----
Section "Container logs (last 200 lines, latest revision)"
try {
    $logs = az containerapp logs show -n $apiApp -g $rg --tail 200 --format text 2>&1
    foreach ($line in $logs) { Log "  $line" }
} catch {
    Log "  Failed to fetch logs: $($_.Exception.Message)"
}

# ---- Done ----
Section "Done"
Log "Full output saved to: $logFile"
Log "(Agent will read this file to diagnose the issue.)"
