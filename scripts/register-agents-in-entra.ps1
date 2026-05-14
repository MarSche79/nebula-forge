<#
.SYNOPSIS
  Register the 14 Nebula Forge agents as Entra app registrations so they
  appear in Entra → Applications → Enterprise applications under the
  "Agents" filter and gain full identity governance (owners, audit logs,
  conditional access, disable-on-demand).

.DESCRIPTION
  Microsoft's Entra Agent ID (preview) currently only displays agents
  provisioned via Copilot Studio / Azure AI Foundry. For self-hosted
  agents like ours, the equivalent is a regular app reg + service
  principal with the `WindowsAzureActiveDirectoryIntegratedApp` tag plus
  a custom `AgentType=NebulaForge` tag so the tenant admin can filter.

  Idempotent — re-running just updates display names / tags. Writes the
  app IDs back into `azure/portal/src/lib/nebulaforge-agents.json` so the
  portal can deep-link from the Agents Board into the agent's Entra
  Application page.

.PARAMETER ResourceGroup
  Resource group of the Container Apps. Defaults to
  rg-nebula-forge-nebula-forge.
#>

[CmdletBinding()]
param(
    [string]$ResourceGroup = 'rg-nebula-forge-nebula-forge'
)

$ErrorActionPreference = 'Stop'

$agents = @(
    @{ id='hr';           display='HR Assistant';            shortName='HR';           icon='👥'; description='Crew screening, onboarding, leave-request triage. Backed by Azure OpenAI gpt-4o-mini, scoped to /careers and /hr/* in NebulaForge.' }
    @{ id='materials';    display='Material Analyst';        shortName='Materials';    icon='🔬'; description='Mineral classification, sample comparison, mass-spectrometry interpretation across station collections.' }
    @{ id='exploration';  display='Exploration Navigator';   shortName='Exploration';  icon='🚀'; description='Mission planning, route optimisation, celestial-body knowledge base for deep-space surveys.' }
    @{ id='science';      display='Science Officer';         shortName='Science';      icon='🧪'; description='Experiment tracking, observation logging, hypothesis review, publication drafting.' }
    @{ id='safety';       display='Safety Officer';          shortName='Safety';       icon='🛡️'; description='Incident response, radiation monitoring, emergency protocols, hazard reporting.' }
    @{ id='engineering';  display='Chief Engineer';          shortName='Engineering';  icon='🛠️'; description='Station-systems telemetry, repairs, diagnostics, power-grid balancing.' }
    @{ id='logistics';    display='Quartermaster';           shortName='Logistics';    icon='📦'; description='Cargo manifests, inventory reconciliation, supply-chain orchestration, storage allocation.' }
    @{ id='comms';        display='Communications Officer';  shortName='Comms';        icon='📡'; description='Internal messaging, station broadcasts, signal-relay health, deep-space transmission scheduling.' }
    @{ id='medbay';       display='Medical Officer';         shortName='Med-Bay';      icon='⚕️'; description='Crew health records, checkup scheduling, medication inventory, psychological well-being check-ins.' }
    @{ id='scribe';       display='Nebula Scribe';           shortName='Scribe';       icon='📄'; description='Authors and publishes Markdown documents (mission reports, geology surveys, HR memos, incidents) into SharePoint via Power Automate as the agentops service-account user.' }
    @{ id='herald';       display='Pulsar Herald';           shortName='Herald';       icon='💬'; description='Routine + intentional CC-trigger Teams posts into the Nebula Forge agent channel — drives Purview Communication Compliance demo.' }
    @{ id='sentinel';     display='Quasar Sentinel';         shortName='Sentinel';     icon='🛡️'; description='Compliance investigations, Purview sensitivity-label application, eDiscovery-style sweeps of the agent SharePoint site.' }
    @{ id='auditor';      display='Astra Auditor';           shortName='Auditor';      icon='⚠️'; description='Emits synthetic Defender / Entra audit signals (risky sign-in, mailbox rule, app consent, MFA fatigue, impossible travel, etc.) into Log Analytics for Defender XDR custom-detection rules.' }
    @{ id='whisperer';    display='Void Whisperer';          shortName='Whisperer';    icon='💀'; description='AI red-team agent — fires adversarial prompts (jailbreak, credential theft, prompt injection, malicious URL, LLM recon) at the demo Azure OpenAI endpoint to keep Defender for AI alerts flowing.' }
)

Write-Host ''
Write-Host '=========================================================' -ForegroundColor Cyan
Write-Host '   Registering 14 Nebula Forge agents in Entra'           -ForegroundColor Cyan
Write-Host '=========================================================' -ForegroundColor Cyan
Write-Host ''

$tenantId = az account show --query tenantId -o tsv
Write-Host "Tenant: $tenantId" -ForegroundColor DarkGray
Write-Host "RG:     $ResourceGroup" -ForegroundColor DarkGray
Write-Host ''

$existingApps = az ad app list --filter "startswith(displayName,'NebulaForge - ')" --query "[].{displayName:displayName,appId:appId,id:id}" -o json | ConvertFrom-Json
function Find-ExistingApp([string]$display) {
    return $existingApps | Where-Object { $_.displayName -eq "NebulaForge - $display" } | Select-Object -First 1
}

function Invoke-GraphPost([string]$Uri, [hashtable]$Body) {
    $tmp = New-TemporaryFile
    try {
        ($Body | ConvertTo-Json -Depth 8) | Out-File -FilePath $tmp.FullName -Encoding UTF8 -NoNewline
        $resp = az rest --method post --uri $Uri --headers "Content-Type=application/json" --body "@$($tmp.FullName)" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host ("    [warn] POST $Uri failed: " + $resp) -ForegroundColor DarkYellow
            return $null
        }
        return ($resp | Out-String) | ConvertFrom-Json
    } finally {
        Remove-Item $tmp.FullName -Force -ErrorAction SilentlyContinue
    }
}
function Invoke-GraphPatch([string]$Uri, [hashtable]$Body) {
    $tmp = New-TemporaryFile
    try {
        ($Body | ConvertTo-Json -Depth 8) | Out-File -FilePath $tmp.FullName -Encoding UTF8 -NoNewline
        az rest --method patch --uri $Uri --headers "Content-Type=application/json" --body "@$($tmp.FullName)" 2>&1 | Out-Null
    } finally {
        Remove-Item $tmp.FullName -Force -ErrorAction SilentlyContinue
    }
}

$results = @()

foreach ($agent in $agents) {
    $name = "NebulaForge - $($agent.display)"
    $existing = Find-ExistingApp $agent.display
    $tags = @('WindowsAzureActiveDirectoryIntegratedApp', 'NebulaForgeAgent', "AgentService=$($agent.id)", "AppType=AgentApp")

    if ($existing) {
        Write-Host "  $($agent.icon) $($agent.display.PadRight(28)) -> updating existing ($($existing.appId))" -ForegroundColor Yellow
        Invoke-GraphPatch "https://graph.microsoft.com/v1.0/applications/$($existing.id)" @{
            tags = $tags
            description = $agent.description
            notes = "Container app: ca-$($agent.id)-jiehil2zaklu2 (internal ingress). Domain: $($agent.shortName)."
        }
        $appId = $existing.appId
    } else {
        Write-Host "  $($agent.icon) $($agent.display.PadRight(28)) -> creating..." -ForegroundColor Cyan
        $appResp = Invoke-GraphPost "https://graph.microsoft.com/v1.0/applications" @{
            displayName = $name
            signInAudience = 'AzureADMyOrg'
            description = $agent.description
            notes = "Container app: ca-$($agent.id)-jiehil2zaklu2 (internal ingress). Domain: $($agent.shortName)."
            tags = $tags
        }
        if (-not $appResp) { Write-Host "    [skip] create failed" -ForegroundColor Red; continue }
        $appId = $appResp.appId
        Invoke-GraphPost "https://graph.microsoft.com/v1.0/servicePrincipals" @{
            appId = $appId
            tags = $tags
        } | Out-Null
    }

    $results += [pscustomobject]@{
        id          = $agent.id
        display     = $agent.display
        shortName   = $agent.shortName
        icon        = $agent.icon
        appId       = $appId
        description = $agent.description
        portalUrl   = "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Overview/appId/$appId"
        enterpriseAppUrl = "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Overview/appId/$appId"
        containerApp = "ca-$($agent.id)-jiehil2zaklu2"
    }
}

Write-Host ''
Write-Host 'All 14 agents registered.' -ForegroundColor Green
Write-Host ''
Write-Host 'View in Entra:' -ForegroundColor Yellow
Write-Host '  https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade'
Write-Host '  Filter: tag = "NebulaForgeAgent"'
Write-Host ''

# Persist for the portal to deep-link from the Agents Board
$portalLib = Join-Path $PSScriptRoot '..\azure\portal\src\lib'
if (Test-Path $portalLib) {
    $jsonPath = Join-Path $portalLib 'nebulaforge-agents.json'
    $results | ConvertTo-Json -Depth 6 | Out-File -FilePath $jsonPath -Encoding UTF8
    Write-Host "Wrote $jsonPath ($($results.Count) entries)" -ForegroundColor Green
}

Write-Host ''
Write-Host 'Per-agent URLs:' -ForegroundColor Yellow
$results | Select-Object id, display, appId | Format-Table -AutoSize
