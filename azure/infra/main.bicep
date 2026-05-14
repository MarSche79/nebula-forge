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

@description('Custom hostnames bound to the portal (e.g. ["www.nebula-forge.at"]).')
param customDomainHostnames array = []

@description('Per-hostname managed-cert resource IDs. Same length and order as customDomainHostnames.')
param portalCustomDomains array = []

// Per-service container images, populated by azd from SERVICE_<NAME>_IMAGE_NAME.
param apiImageName string = ''
param portalImageName string = ''
param hrImageName string = ''
param materialsImageName string = ''
param explorationImageName string = ''
param scienceImageName string = ''
param safetyImageName string = ''
param engineeringImageName string = ''
param logisticsImageName string = ''
param commsImageName string = ''
param medbayImageName string = ''
param scribeImageName string = ''
param heraldImageName string = ''
param sentinelImageName string = ''
param auditorImageName string = ''
param whispererImageName string = ''
param agentTickImageName string = ''

@description('Power Automate webhook (Teams post message)')
@secure()
param paTeamsWebhook string = ''

@description('Power Automate webhook (Communication Compliance trigger)')
@secure()
param paCcWebhook string = ''

@description('Power Automate webhook (SharePoint create file)')
@secure()
param paSpCreateWebhook string = ''

@description('Power Automate webhook (SharePoint apply label)')
@secure()
param paSpLabelWebhook string = ''

@description('Whether to deploy a gpt-4o (full) deployment for richer document generation')
param deployGpt4o bool = true

@description('CRON expression for the agent-tick job')
param agentTickCron string = '*/30 * * * *'

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
    customDomainHostnames: customDomainHostnames
    portalCustomDomains: portalCustomDomains
    apiImageName: apiImageName
    portalImageName: portalImageName
    hrImageName: hrImageName
    materialsImageName: materialsImageName
    explorationImageName: explorationImageName
    scienceImageName: scienceImageName
    safetyImageName: safetyImageName
    engineeringImageName: engineeringImageName
    logisticsImageName: logisticsImageName
    commsImageName: commsImageName
    medbayImageName: medbayImageName
    scribeImageName: scribeImageName
    heraldImageName: heraldImageName
    sentinelImageName: sentinelImageName
    auditorImageName: auditorImageName
    whispererImageName: whispererImageName
    agentTickImageName: agentTickImageName
    paTeamsWebhook: paTeamsWebhook
    paCcWebhook: paCcWebhook
    paSpCreateWebhook: paSpCreateWebhook
    paSpLabelWebhook: paSpLabelWebhook
    deployGpt4o: deployGpt4o
    agentTickCron: agentTickCron
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

// ----- Agent army -----
output AZURE_OPENAI_DEPLOYMENT_4O string = resources.outputs.AZURE_OPENAI_DEPLOYMENT_4O
output DEFENDER_INGEST_WORKFLOW_NAME string = resources.outputs.DEFENDER_INGEST_WORKFLOW_NAME
output DEFENDER_INGEST_CALLBACK_URL string = resources.outputs.DEFENDER_INGEST_CALLBACK_URL
output AGENT_TICK_JOB_NAME string = resources.outputs.AGENT_TICK_JOB_NAME
output AGENT_CALLBACK_SECRET string = resources.outputs.AGENT_CALLBACK_SECRET
