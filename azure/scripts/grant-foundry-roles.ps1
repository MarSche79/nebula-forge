<#
.SYNOPSIS
    Grants the API container app's managed identity the roles needed
    to call Azure AI Foundry and Azure OpenAI.
.DESCRIPTION
    Discovers the resources from the deployed resource group, no manual
    env vars needed beyond what azd already sets.
    Roles assigned:
      - "Azure AI Developer"             on the AI Foundry project
      - "Cognitive Services OpenAI User" on the Azure OpenAI account
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

Write-Host "Granting Foundry roles to API managed identity" -ForegroundColor Cyan

# Load azd env
$envValues = @{}
$raw = azd env get-values 2>$null
if ($LASTEXITCODE -ne 0) { throw "Failed to read azd environment." }
foreach ($line in $raw) {
    if ($line -match '^([A-Z0-9_]+)="?(.*?)"?$') {
        $envValues[$Matches[1]] = $Matches[2]
    }
}

$subId = $envValues['AZURE_SUBSCRIPTION_ID']
$rg    = $envValues['AZURE_RESOURCE_GROUP']
if (-not $subId) { throw "AZURE_SUBSCRIPTION_ID not in azd env." }
if (-not $rg)    { throw "AZURE_RESOURCE_GROUP not in azd env." }

az account set --subscription $subId | Out-Null

# Discover the API container app (tagged azd-service-name=api)
Write-Host "-> Discovering API container app..." -ForegroundColor Gray
$allApps = (az containerapp list -g $rg -o json) | ConvertFrom-Json
$apiApp  = $allApps | Where-Object { $_.tags.'azd-service-name' -eq 'api' } | Select-Object -First 1
if (-not $apiApp) { throw "No container app tagged azd-service-name=api in $rg" }
$apiAppName = $apiApp.name
Write-Host "  Found: $apiAppName"

# Resolve managed identity principal ID
$principalId = az containerapp show -n $apiAppName -g $rg --query "identity.principalId" -o tsv
if (-not $principalId) {
    # Maybe it's user-assigned; try the userAssignedIdentities
    $userAssignedIds = az containerapp show -n $apiAppName -g $rg --query "identity.userAssignedIdentities" -o json
    $idsObj = $userAssignedIds | ConvertFrom-Json
    if ($idsObj) {
        $firstUai = $idsObj.PSObject.Properties | Select-Object -First 1
        $principalId = $firstUai.Value.principalId
    }
}
if (-not $principalId) { throw "Could not resolve principalId on '$apiAppName'." }
Write-Host "  principalId = $principalId"

# Discover OpenAI account in the RG (kind=OpenAI)
Write-Host "-> Discovering Azure OpenAI account..." -ForegroundColor Gray
$accounts = (az cognitiveservices account list -g $rg -o json) | ConvertFrom-Json
$openAi = $accounts | Where-Object { $_.kind -eq 'OpenAI' } | Select-Object -First 1
if (-not $openAi) {
    # Newer "AIServices" kind
    $openAi = $accounts | Where-Object { $_.kind -eq 'AIServices' } | Select-Object -First 1
}
if (-not $openAi) { throw "No OpenAI/AIServices account found in $rg." }
$openAiAccountId = $openAi.id
Write-Host "  Found: $($openAi.name) ($openAi.kind)"

# Discover AI Foundry project
Write-Host "-> Discovering AI Foundry project..." -ForegroundColor Gray
$workspaces = (az resource list -g $rg --resource-type "Microsoft.MachineLearningServices/workspaces" -o json) | ConvertFrom-Json
$project = $workspaces | Where-Object { $_.kind -eq 'Project' } | Select-Object -First 1
if (-not $project) { throw "No AI Foundry Project (kind=Project) found in $rg." }
$foundryProjectId = $project.id
Write-Host "  Found: $($project.name)"

function Grant-Role {
    param([string]$RoleName, [string]$Scope)
    Write-Host "-> Assigning '$RoleName' on $Scope" -ForegroundColor Gray

    $existing = az role assignment list `
        --assignee $principalId --role "$RoleName" --scope $Scope `
        --query "[].id" -o tsv 2>$null

    if ($existing) {
        Write-Host "  Already assigned" -ForegroundColor DarkGray
        return
    }

    az role assignment create `
        --assignee-object-id $principalId `
        --assignee-principal-type ServicePrincipal `
        --role "$RoleName" `
        --scope $Scope `
        --output none

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Assigned OK" -ForegroundColor Green
    } else {
        Write-Warning "  Failed to assign $RoleName"
    }
}

Grant-Role -RoleName 'Azure AI Developer'             -Scope $foundryProjectId
Grant-Role -RoleName 'Cognitive Services OpenAI User' -Scope $openAiAccountId

Write-Host ""
Write-Host "Foundry roles granted." -ForegroundColor Green
Write-Host "Note: role propagation can take up to 5 minutes." -ForegroundColor Yellow
