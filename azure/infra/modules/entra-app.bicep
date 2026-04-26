@description('Azure region')
param location string

@description('Resource tags')
param tags object

@description('Display name of the Entra app registration')
param appDisplayName string = 'Nebula Forge Portal'

@description('SPA redirect URI (the portal FQDN, https://...)')
param portalRedirectUri string

@description('User-assigned managed identity resource ID used to run the script. Must have Application Administrator (or equivalent) directory role granted out-of-band.')
param managedIdentityId string

@description('Deployment script resource name')
param deploymentScriptName string

resource entraScript 'Microsoft.Resources/deploymentScripts@2023-08-01' = {
  name: deploymentScriptName
  location: location
  tags: tags
  kind: 'AzureCLI'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityId}': {}
    }
  }
  properties: {
    azCliVersion: '2.61.0'
    timeout: 'PT30M'
    retentionInterval: 'PT1H'
    cleanupPreference: 'OnSuccess'
    environmentVariables: [
      { name: 'APP_DISPLAY_NAME', value: appDisplayName }
      { name: 'REDIRECT_URI',     value: portalRedirectUri }
    ]
    scriptContent: '''
set -euo pipefail

echo "Looking for existing Entra app: $APP_DISPLAY_NAME"
APP_ID=$(az ad app list --display-name "$APP_DISPLAY_NAME" --query "[0].appId" -o tsv || true)

if [ -z "$APP_ID" ] || [ "$APP_ID" = "null" ]; then
  echo "Creating new Entra app registration..."
  APP_ID=$(az ad app create \
    --display-name "$APP_DISPLAY_NAME" \
    --sign-in-audience AzureADMyOrg \
    --enable-id-token-issuance true \
    --query appId -o tsv)
fi

echo "App ID: $APP_ID"

OBJ_ID=$(az ad app show --id "$APP_ID" --query id -o tsv)

# Configure SPA redirect URI + Microsoft Graph User.Read delegated permission
cat > /tmp/manifest.json <<EOF
{
  "spa": {
    "redirectUris": ["$REDIRECT_URI", "$REDIRECT_URI/", "${REDIRECT_URI}/auth/callback"]
  },
  "requiredResourceAccess": [
    {
      "resourceAppId": "00000003-0000-0000-c000-000000000000",
      "resourceAccess": [
        { "id": "e1fe6dd8-ba31-4d61-89e7-88639da4683d", "type": "Scope" }
      ]
    }
  ]
}
EOF

az rest --method PATCH \
  --uri "https://graph.microsoft.com/v1.0/applications/$OBJ_ID" \
  --headers "Content-Type=application/json" \
  --body @/tmp/manifest.json

# Ensure a service principal exists in the tenant
SP_ID=$(az ad sp list --filter "appId eq '$APP_ID'" --query "[0].id" -o tsv || true)
if [ -z "$SP_ID" ] || [ "$SP_ID" = "null" ]; then
  az ad sp create --id "$APP_ID" >/dev/null
fi

TENANT_ID=$(az account show --query tenantId -o tsv)

cat > "$AZ_SCRIPTS_OUTPUT_PATH" <<EOF
{ "appId": "$APP_ID", "tenantId": "$TENANT_ID" }
EOF

echo "Done. appId=$APP_ID tenantId=$TENANT_ID"
'''
  }
}

output appId string = entraScript.properties.outputs.appId
output tenantId string = entraScript.properties.outputs.tenantId
