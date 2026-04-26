<#
.SYNOPSIS
    Fixes the AI_PROJECT_ENDPOINT env var on the API container app to use
    the correct Azure AI Foundry connection string format.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$logFile = Join-Path $PSScriptRoot 'fix-foundry-output.log'
if (Test-Path $logFile) { Remove-Item $logFile -Force }

function Log {
    param([string]$Text)
    Write-Host $Text
    Add-Content -LiteralPath $logFile -Value $Text
}

Log "Fix Foundry endpoint - $(Get-Date -Format 'u')"

# Load azd env
$envValues = @{}
$raw = azd env get-values 2>$null
foreach ($line in $raw) {
    if ($line -match '^([A-Z0-9_]+)="?(.*?)"?$') {
        $envValues[$Matches[1]] = $Matches[2]
    }
}
$rg    = $envValues['AZURE_RESOURCE_GROUP']
$subId = $envValues['AZURE_SUBSCRIPTION_ID']
$location = $envValues['AZURE_LOCATION']
if (-not $location) { $location = 'westeurope' }

az account set --subscription $subId | Out-Null

# Find the AI Foundry Project (kind=Project)
Log "Discovering AI Foundry project in $rg..."
$workspaces = (az resource list -g $rg --resource-type "Microsoft.MachineLearningServices/workspaces" -o json) | ConvertFrom-Json
$project = $workspaces | Where-Object { $_.kind -eq 'Project' } | Select-Object -First 1
if (-not $project) { throw "No Foundry project found." }

$projectName = $project.name
Log "Found project: $projectName"

# Get the project's discoveryUrl (the actual endpoint Azure exposes)
$projectDetail = az resource show --ids $project.id --api-version 2024-10-01 -o json | ConvertFrom-Json
$discoveryUrl = $projectDetail.properties.discoveryUrl
Log "discoveryUrl = $discoveryUrl"

# Build the connection string format used by AIProjectsClient.fromConnectionString
$connString = "$location.api.azureml.ms;$subId;$rg;$projectName"
Log "Connection string = $connString"

# Update the API container app's env var
$apiApp = az containerapp list -g $rg --query "[?starts_with(name, 'ca-api-')].name | [0]" -o tsv
Log "API container app: $apiApp"

Log "Setting AI_PROJECT_ENDPOINT = $connString"
az containerapp update -n $apiApp -g $rg `
    --set-env-vars "AI_PROJECT_ENDPOINT=$connString" `
    --output none

# Also persist in azd env so future provisions don't revert
azd env set AI_PROJECT_ENDPOINT "$connString" | Out-Null
azd env set AI_PROJECT_DISCOVERY_URL "$discoveryUrl" | Out-Null

Log ""
Log "Done. Wait ~30s for new revision, then test chat in the portal."
Log "If chat still fails, check container logs:"
Log "  az containerapp logs show -n $apiApp -g $rg --tail 100 --format text"
