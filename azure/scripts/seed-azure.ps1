<#
.SYNOPSIS
    Seeds the Nebula Forge Azure deployment with initial data.
.DESCRIPTION
    Sets SEED_ON_START=true on each MCP container app to trigger seeding,
    waits for the new revision, then unsets the flag.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$McpNames = @(
    'hr', 'materials', 'exploration', 'science', 'safety',
    'engineering', 'logistics', 'comms', 'medbay'
)

Write-Host "Seeding Nebula Forge MCP servers" -ForegroundColor Cyan

# Load azd env
$envValues = @{}
$raw = azd env get-values 2>$null
if ($LASTEXITCODE -ne 0) { throw "Failed to read azd environment." }
foreach ($line in $raw) {
    if ($line -match '^([A-Z0-9_]+)="?(.*?)"?$') {
        $envValues[$Matches[1]] = $Matches[2]
    }
}

$rg = $envValues['AZURE_RESOURCE_GROUP']
$subId = $envValues['AZURE_SUBSCRIPTION_ID']
if (-not $rg) { throw "AZURE_RESOURCE_GROUP not found in azd env." }

# Make sure az CLI is on the right subscription
if ($subId) {
    Write-Host "-> Setting az subscription to $subId" -ForegroundColor Gray
    az account set --subscription $subId | Out-Null
}

# Check Microsoft.App provider is registered
Write-Host "-> Checking Microsoft.App provider registration..." -ForegroundColor Gray
$state = az provider show -n Microsoft.App --query registrationState -o tsv 2>$null
if ($state -ne 'Registered') {
    Write-Host "  Registering Microsoft.App provider (one-time, takes ~2 min)..." -ForegroundColor Yellow
    az provider register -n Microsoft.App --wait | Out-Null
}

# List ALL container apps in the RG once, then filter in PowerShell (avoids JMESPath quoting hell)
Write-Host "-> Discovering container apps in $rg..." -ForegroundColor Gray
$appsJson = az containerapp list -g $rg -o json
$allApps = $appsJson | ConvertFrom-Json

$results = @()

foreach ($mcp in $McpNames) {
    Write-Host ""
    Write-Host "-- $mcp --" -ForegroundColor Yellow

    $app = $allApps | Where-Object { $_.tags.'azd-service-name' -eq $mcp } | Select-Object -First 1
    if (-not $app) {
        Write-Warning "  No container app tagged azd-service-name=$mcp"
        $results += [pscustomobject]@{ Mcp = $mcp; Status = 'NotFound'; Detail = 'app not found' }
        continue
    }
    $appName = $app.name

    try {
        Write-Host "  ($appName) Setting SEED_ON_START=true..."
        az containerapp update --name $appName --resource-group $rg `
            --set-env-vars SEED_ON_START=true --output none

        Write-Host "  Waiting 30s for new revision..."
        Start-Sleep -Seconds 30

        Write-Host "  Unsetting SEED_ON_START..."
        az containerapp update --name $appName --resource-group $rg `
            --remove-env-vars SEED_ON_START --output none

        $results += [pscustomobject]@{ Mcp = $mcp; Status = 'OK'; Detail = 'seeded via restart' }
    }
    catch {
        Write-Warning "  Failed: $($_.Exception.Message)"
        $results += [pscustomobject]@{ Mcp = $mcp; Status = 'Error'; Detail = $_.Exception.Message }
    }
}

Write-Host ""
Write-Host "Seed summary:" -ForegroundColor Cyan
$results | Format-Table -AutoSize
