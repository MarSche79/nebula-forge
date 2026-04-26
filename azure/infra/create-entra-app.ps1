#!/usr/bin/env pwsh
# Standalone helper to create the Nebula Forge Portal Entra app registration.
# Use this when main.bicep was deployed with createEntraApp=false (the default).
#
# Usage:
#   $env:PORTAL_FQDN = 'ca-portal-xxxx.westeurope.azurecontainerapps.io'
#   ./infra/create-entra-app.ps1

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($env:PORTAL_FQDN)) {
    $portalUrl = & azd env get-value PORTAL_BASE_URL 2>$null
    if ([string]::IsNullOrWhiteSpace($portalUrl)) {
        throw 'PORTAL_FQDN env var not set and PORTAL_BASE_URL not in azd env. Provide one.'
    }
    $env:PORTAL_FQDN = $portalUrl -replace '^https?://',''
}

$displayName = 'Nebula Forge Portal'
$portalUrl   = "https://$($env:PORTAL_FQDN)"

Write-Host "Looking for existing app '$displayName'..." -ForegroundColor Cyan
$existing = az ad app list --display-name $displayName --query '[0].appId' -o tsv

if ([string]::IsNullOrWhiteSpace($existing) -or $existing -eq 'null') {
    Write-Host 'Creating new app registration...' -ForegroundColor Cyan
    $appId = az ad app create `
        --display-name $displayName `
        --sign-in-audience AzureADMyOrg `
        --enable-id-token-issuance true `
        --web-redirect-uris $portalUrl `
        --query appId -o tsv
} else {
    Write-Host "Reusing existing app: $existing" -ForegroundColor Cyan
    $appId = $existing
}

$objectId = az ad app show --id $appId --query id -o tsv

# Configure SPA redirect + User.Read delegated permission
$manifest = @{
    spa = @{
        redirectUris = @($portalUrl, "$portalUrl/", "$portalUrl/auth/callback")
    }
    requiredResourceAccess = @(@{
        resourceAppId  = '00000003-0000-0000-c000-000000000000'  # Microsoft Graph
        resourceAccess = @(@{
            id   = 'e1fe6dd8-ba31-4d61-89e7-88639da4683d'        # User.Read (delegated)
            type = 'Scope'
        })
    })
} | ConvertTo-Json -Depth 8 -Compress

$tmp = Join-Path $PSScriptRoot 'entra-manifest.json'
Set-Content -Path $tmp -Value $manifest -Encoding utf8

az rest --method PATCH `
    --uri "https://graph.microsoft.com/v1.0/applications/$objectId" `
    --headers 'Content-Type=application/json' `
    --body "@$tmp" | Out-Null

Remove-Item $tmp -Force

# Ensure service principal exists
$sp = az ad sp list --filter "appId eq '$appId'" --query '[0].id' -o tsv
if ([string]::IsNullOrWhiteSpace($sp) -or $sp -eq 'null') {
    az ad sp create --id $appId | Out-Null
}

$tenantId = az account show --query tenantId -o tsv

azd env set AZURE_ENTRA_CLIENT_ID $appId
azd env set AZURE_ENTRA_TENANT_ID $tenantId

Write-Host ''
Write-Host "App registration ready:" -ForegroundColor Green
Write-Host "  appId    : $appId"
Write-Host "  tenantId : $tenantId"
Write-Host "  redirect : $portalUrl"
Write-Host ''
Write-Host 'Re-run "azd deploy" so the Container Apps pick up the new ENTRA_CLIENT_ID env var.' -ForegroundColor Yellow
