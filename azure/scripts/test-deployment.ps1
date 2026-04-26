<#
.SYNOPSIS
    Smoke-tests a deployed Nebula Forge environment.
#>
[CmdletBinding()]
param(
    [int]$TimeoutSec = 30
)

$ErrorActionPreference = 'Continue'

$McpNames = @(
    'hr', 'materials', 'exploration', 'science', 'safety',
    'engineering', 'logistics', 'comms', 'medbay'
)

Write-Host "Smoke testing Nebula Forge deployment" -ForegroundColor Cyan

$envValues = @{}
$raw = azd env get-values 2>$null
if ($LASTEXITCODE -ne 0) { throw "Failed to read azd environment." }
foreach ($line in $raw) {
    if ($line -match '^([A-Z0-9_]+)="?(.*?)"?$') {
        $envValues[$Matches[1]] = $Matches[2]
    }
}

$rg    = $envValues['AZURE_RESOURCE_GROUP']
$subId = $envValues['AZURE_SUBSCRIPTION_ID']
if ($subId) { az account set --subscription $subId | Out-Null }

function Test-Endpoint {
    param([string]$Name, [string]$Url, [int]$Expected = 200)
    if (-not $Url) {
        return [pscustomobject]@{ Service=$Name; Url='(missing)'; Expected=$Expected; Actual='n/a'; Result='SKIP' }
    }
    try {
        $resp = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec $TimeoutSec -UseBasicParsing -ErrorAction Stop
        $code = [int]$resp.StatusCode
        $ok   = ($code -eq $Expected)
        return [pscustomobject]@{ Service=$Name; Url=$Url; Expected=$Expected; Actual=$code; Result=if ($ok) {'PASS'} else {'FAIL'} }
    }
    catch {
        $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        return [pscustomobject]@{ Service=$Name; Url=$Url; Expected=$Expected; Actual=$code; Result='FAIL' }
    }
}

function Get-EnvUrl {
    param([string[]]$Candidates)
    foreach ($c in $Candidates) { if ($envValues[$c]) { return $envValues[$c] } }
    return $null
}

$results = @()
$portalUrl = Get-EnvUrl @('PORTAL_BASE_URL','PORTAL_URL','SERVICE_PORTAL_URI')
$apiUrl    = Get-EnvUrl @('API_BASE_URL','API_URL','SERVICE_API_URI')

$results += Test-Endpoint -Name 'Portal' -Url $portalUrl
$results += Test-Endpoint -Name 'API /api/health' -Url $(if ($apiUrl) { "$($apiUrl.TrimEnd('/'))/api/health" } else { $null })

# MCP servers - discover by tag (filter in PS to avoid JMESPath quoting issues)
if ($rg) {
    Write-Host ""
    Write-Host "Discovering MCP container apps..." -ForegroundColor Gray
    try {
        $allApps = (az containerapp list -g $rg -o json 2>$null) | ConvertFrom-Json
        foreach ($mcp in $McpNames) {
            $app = $allApps | Where-Object { $_.tags.'azd-service-name' -eq $mcp } | Select-Object -First 1
            if ($app) {
                $results += [pscustomobject]@{
                    Service="MCP $mcp"; Url="(internal: $($app.name))"; Expected=200
                    Actual='internal'; Result='INTERNAL'
                }
            } else {
                $results += [pscustomobject]@{
                    Service="MCP $mcp"; Url='(not found)'; Expected=200; Actual='n/a'; Result='SKIP'
                }
            }
        }
    } catch {
        Write-Warning "Could not list container apps: $($_.Exception.Message)"
    }
}

Write-Host ""
Write-Host "Results:" -ForegroundColor Cyan
$results | Format-Table Service, Expected, Actual, Result, Url -AutoSize

$failed = ($results | Where-Object { $_.Result -eq 'FAIL' }).Count
if ($failed -gt 0) { Write-Host "$failed failed." -ForegroundColor Red; exit 1 }
Write-Host "All public checks passed." -ForegroundColor Green
Write-Host "(MCP servers are internal-only - only reachable from within the Container Apps env.)" -ForegroundColor Gray
