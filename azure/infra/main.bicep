targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the azd environment - used to derive resource names.')
param environmentName string

@minLength(1)
@description('Primary Azure region for all resources.')
param location string = 'westeurope'

@description('Optional principal ID of the user/SP running azd up. Used for data-plane RBAC and as the Postgres AAD admin.')
param principalId string = ''

@description('Display name of the principal (UPN for a user). Used as the Postgres AAD admin label.')
param principalName string = ''

@description('Principal type for the AAD admin assignment.')
@allowed([ 'User', 'Group', 'ServicePrincipal' ])
param principalType string = 'User'

@description('Whether to attempt Entra app registration via deploymentScript. Requires elevated identity.')
param createEntraApp bool = false

@description('Whether portal authentication (Easy Auth) is enabled. String "true"/"false" so it tolerates azd env-var substitution.')
param authEnabled string = 'false'

@description('Entra app (client) ID for portal Easy Auth.')
param aadClientId string = ''

@description('Entra app client secret for portal Easy Auth — passed as a secure parameter.')
@secure()
param aadClientSecret string = ''

var resourceToken = uniqueString(subscription().subscriptionId, environmentName, location)
var tags = {
  'azd-env-name': environmentName
  project: 'nebula-forge'
}

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-nebula-forge-${environmentName}'
  location: location
  tags: tags
}

module resources 'resources.bicep' = {
  name: 'resources-${resourceToken}'
  scope: rg
  params: {
    location: location
    resourceToken: resourceToken
    tags: tags
    principalId: principalId
    principalName: principalName
    principalType: principalType
    createEntraApp: createEntraApp
    authEnabled: toLower(authEnabled) == 'true'
    aadClientId: aadClientId
    aadClientSecret: aadClientSecret
  }
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_TENANT_ID string = subscription().tenantId
output AZURE_SUBSCRIPTION_ID string = subscription().subscriptionId

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.AZURE_CONTAINER_REGISTRY_ENDPOINT
output AZURE_CONTAINER_REGISTRY_NAME string = resources.outputs.AZURE_CONTAINER_REGISTRY_NAME
output AZURE_CONTAINER_APPS_ENVIRONMENT_ID string = resources.outputs.AZURE_CONTAINER_APPS_ENVIRONMENT_ID
output AZURE_CONTAINER_APPS_ENVIRONMENT_DEFAULT_DOMAIN string = resources.outputs.AZURE_CONTAINER_APPS_ENVIRONMENT_DEFAULT_DOMAIN

output AZURE_STORAGE_ACCOUNT_NAME string = resources.outputs.AZURE_STORAGE_ACCOUNT_NAME

output AZURE_OPENAI_ENDPOINT string = resources.outputs.AZURE_OPENAI_ENDPOINT
output AZURE_OPENAI_DEPLOYMENT_NAME string = resources.outputs.AZURE_OPENAI_DEPLOYMENT_NAME
output AI_PROJECT_ENDPOINT string = resources.outputs.AI_PROJECT_ENDPOINT

output AZURE_MANAGED_IDENTITY_CLIENT_ID string = resources.outputs.AZURE_MANAGED_IDENTITY_CLIENT_ID
output AZURE_MANAGED_IDENTITY_ID string = resources.outputs.AZURE_MANAGED_IDENTITY_ID

output API_BASE_URL string = resources.outputs.API_BASE_URL
output PORTAL_BASE_URL string = resources.outputs.PORTAL_BASE_URL
output PORTAL_FQDN string = resources.outputs.PORTAL_FQDN
output API_FQDN string = resources.outputs.API_FQDN

output AZURE_ENTRA_CLIENT_ID string = resources.outputs.AZURE_ENTRA_CLIENT_ID
output AZURE_ENTRA_TENANT_ID string = resources.outputs.AZURE_ENTRA_TENANT_ID

output PSQL_HOST string = resources.outputs.PSQL_HOST
output PSQL_DATABASE string = resources.outputs.PSQL_DATABASE
