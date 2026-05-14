#!/usr/bin/env pwsh
# Post-provision hook for nebula-forge.
# Reads outputs from the azd environment and prints next-step instructions.

$ErrorActionPreference = 'Stop'

function Get-AzdEnvValue {
    param([string]$Name)
    $values = & azd env get-values 2>$null
    foreach ($line in $values) {
        if ($line -match "^$Name=`"?(.*?)`"?$") {
            return $Matches[1]
        }
    }
    return ''
}

Write-Host ''
Write-Host '=========================================================' -ForegroundColor Cyan
Write-Host '   Nebula Forge - Provisioning Complete' -ForegroundColor Cyan
Write-Host '=========================================================' -ForegroundColor Cyan
Write-Host ''

$portalUrl   = Get-AzdEnvValue 'PORTAL_BASE_URL'
$apiUrl      = Get-AzdEnvValue 'API_BASE_URL'
$acrEndpoint = Get-AzdEnvValue 'AZURE_CONTAINER_REGISTRY_ENDPOINT'
$openAi      = Get-AzdEnvValue 'AZURE_OPENAI_ENDPOINT'
$storage     = Get-AzdEnvValue 'AZURE_STORAGE_ACCOUNT_NAME'
$tenantId    = Get-AzdEnvValue 'AZURE_TENANT_ID'
$clientId    = Get-AzdEnvValue 'AZURE_ENTRA_CLIENT_ID'

Write-Host 'Endpoints:' -ForegroundColor Yellow
Write-Host "  Portal      : $portalUrl"
Write-Host "  API         : $apiUrl"
Write-Host "  ACR         : $acrEndpoint"
Write-Host "  Azure OpenAI: $openAi"
Write-Host "  Storage     : $storage"
Write-Host ''

if ([string]::IsNullOrWhiteSpace($clientId)) {
    Write-Host 'Entra app registration was NOT created via Bicep.' -ForegroundColor Yellow
    Write-Host 'Run the helper script next:' -ForegroundColor Yellow
    Write-Host "  `$env:PORTAL_FQDN='$($portalUrl -replace 'https?://','')'; ./infra/create-entra-app.ps1" -ForegroundColor Gray
    Write-Host ''
} else {
    Write-Host 'Entra app:' -ForegroundColor Yellow
    Write-Host "  Tenant ID : $tenantId"
    Write-Host "  Client ID : $clientId"
    Write-Host ''
}

Write-Host 'Next steps:' -ForegroundColor Yellow
Write-Host '  1. azd deploy            # build & push images for all services (now includes 5 new agents + agent-tick job)'
Write-Host '  2. Open the portal URL above and sign in'
Write-Host '  3. (Optional) Seed Azure Tables with demo data:'
Write-Host '     pwsh ./scripts/seed-tables.ps1'
Write-Host ''
Write-Host '=========================================================' -ForegroundColor Cyan
Write-Host '   Agent Army (5 new agents + Kanban board)' -ForegroundColor Cyan
Write-Host '=========================================================' -ForegroundColor Cyan
Write-Host ''
Write-Host '  4. Re-run postgres bootstrap to create the agents schema:'
Write-Host '       pwsh ./infra/postgres-bootstrap.ps1'
Write-Host ''
Write-Host '  5. Power Automate / M365 admin steps required (one-off):'
Write-Host '       Read MANUAL-SETUP.md at the repo root for step-by-step.'
Write-Host '       Summary:'
Write-Host '         a. Create the agentops@<tenant>.onmicrosoft.com service mailbox + license.'
Write-Host '         b. Add it as Member of NebulaForgeAgentSharePoint and Owner of the Teams team.'
Write-Host '         c. Sign in to make.powerautomate.com AS THAT USER, recreate the 4 flows from azure/flows/ templates.'
Write-Host '         d. Copy each flow trigger URL into azd env:'
Write-Host '              azd env set PA_TEAMS_WEBHOOK      ''<url>'''
Write-Host '              azd env set PA_CC_WEBHOOK         ''<url>'''
Write-Host '              azd env set PA_SP_CREATE_WEBHOOK  ''<url>'''
Write-Host '              azd env set PA_SP_LABEL_WEBHOOK   ''<url>'''
Write-Host '         e. Re-run: azd provision  (wires the URLs as Container App secrets)'
Write-Host '         f. Author Purview policies (sensitivity labels / DLP / Communication Compliance) + Defender XDR custom detection.'
Write-Host ''
$tickJob = Get-AzdEnvValue 'AGENT_TICK_JOB_NAME'
if (-not [string]::IsNullOrWhiteSpace($tickJob)) {
    Write-Host "  Cron job: $tickJob (every 30 min by default; override with agentTickCron parameter)"
}
Write-Host ''
