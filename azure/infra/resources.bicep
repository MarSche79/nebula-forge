@description('Azure region')
param location string

@description('Deterministic resource token derived in main.bicep')
param resourceToken string

@description('Common resource tags')
param tags object

@description('Optional principal ID for data-plane RBAC')
param principalId string = ''

@description('Optional principal display name (UPN for users, name for groups). Used as the Postgres AAD admin label.')
param principalName string = ''

@description('Optional principal type (User / Group / ServicePrincipal). Defaults to User.')
@allowed([ 'User', 'Group', 'ServicePrincipal' ])
param principalType string = 'User'

@description('Whether to create the Entra app registration via deployment script')
param createEntraApp bool = false

@description('Whether portal authentication (Easy Auth) is enabled. When true, requires aadClientId and aadClientSecret.')
param authEnabled bool = false

@description('Entra app (client) ID for portal Easy Auth. Required when authEnabled=true.')
param aadClientId string = ''

@description('Entra app client secret for portal Easy Auth — passed as a secure parameter. Required when authEnabled=true.')
@secure()
param aadClientSecret string = ''

@description('Shared secret between portal and API for the proxy trust boundary. Generated fresh each provision if not supplied.')
@secure()
param proxySharedSecret string = newGuid()

@description('Custom domain hostnames bound to the portal (e.g. ["www.nebula-forge.at"]). Used to widen API CORS.')
param customDomainHostnames array = []

@description('Custom hostname -> managed-certificate-id bindings for the portal ingress.')
param portalCustomDomains array = []

// Per-service container images, populated by azd from SERVICE_<NAME>_IMAGE_NAME.
// On first provision (before any `azd deploy`) these are empty and we fall
// back to the platform quickstart placeholder.
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

var placeholderImage = 'mcr.microsoft.com/k8se/quickstart:latest'

// Helper: pick the real per-service image if azd has tracked one, otherwise
// the platform quickstart placeholder (only used on the very first provision
// before `azd deploy` has built any containers).
var mcpImageMap = {
  hr: !empty(hrImageName) ? hrImageName : placeholderImage
  materials: !empty(materialsImageName) ? materialsImageName : placeholderImage
  exploration: !empty(explorationImageName) ? explorationImageName : placeholderImage
  science: !empty(scienceImageName) ? scienceImageName : placeholderImage
  safety: !empty(safetyImageName) ? safetyImageName : placeholderImage
  engineering: !empty(engineeringImageName) ? engineeringImageName : placeholderImage
  logistics: !empty(logisticsImageName) ? logisticsImageName : placeholderImage
  comms: !empty(commsImageName) ? commsImageName : placeholderImage
  medbay: !empty(medbayImageName) ? medbayImageName : placeholderImage
}

var mcpAgents = [
  { name: 'nebula-hr',          serviceName: 'hr',          port: 3001 }
  { name: 'nebula-materials',   serviceName: 'materials',   port: 3002 }
  { name: 'nebula-exploration', serviceName: 'exploration', port: 3003 }
  { name: 'nebula-science',     serviceName: 'science',     port: 3004 }
  { name: 'nebula-safety',      serviceName: 'safety',      port: 3005 }
  { name: 'nebula-engineering', serviceName: 'engineering', port: 3006 }
  { name: 'nebula-logistics',   serviceName: 'logistics',   port: 3007 }
  { name: 'nebula-comms',       serviceName: 'comms',       port: 3008 }
  { name: 'nebula-medbay',      serviceName: 'medbay',      port: 3009 }
]

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    tags: tags
    logAnalyticsName: 'log-${resourceToken}'
    appInsightsName: 'appi-${resourceToken}'
  }
}

module registry 'modules/registry.bicep' = {
  name: 'registry'
  params: {
    location: location
    tags: tags
    registryName: 'acr${resourceToken}'
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    tags: tags
    storageAccountName: 'st${resourceToken}'
  }
}

module containerAppsEnv 'modules/containerapps-env.bicep' = {
  name: 'containerapps-env'
  params: {
    location: location
    tags: tags
    environmentNameResource: 'cae-${resourceToken}'
    logAnalyticsCustomerId: monitoring.outputs.logAnalyticsCustomerId
    logAnalyticsPrimarySharedKey: monitoring.outputs.logAnalyticsPrimarySharedKey
  }
}

module openai 'modules/openai.bicep' = {
  name: 'openai'
  params: {
    location: location
    tags: tags
    accountName: 'oai-${resourceToken}'
    deploymentName: 'gpt-4o-mini'
    modelName: 'gpt-4o-mini'
    modelVersion: '2024-07-18'
    capacity: 50
  }
}

module foundry 'modules/foundry.bicep' = {
  name: 'foundry'
  params: {
    location: location
    tags: tags
    hubName: 'aih-${resourceToken}'
    projectName: 'aip-${resourceToken}'
    storageAccountId: storage.outputs.storageAccountId
    appInsightsId: monitoring.outputs.appInsightsId
    containerRegistryId: registry.outputs.registryId
    openAiAccountId: openai.outputs.accountId
    openAiAccountName: openai.outputs.accountName
    openAiEndpoint: openai.outputs.endpoint
  }
}

module identity 'modules/identity.bicep' = {
  name: 'identity'
  params: {
    location: location
    tags: tags
    identityName: 'id-${resourceToken}'
    registryName: registry.outputs.registryName
    storageAccountName: storage.outputs.storageAccountName
    openAiAccountName: openai.outputs.accountName
    principalId: principalId
  }
}

module entraApp 'modules/entra-app.bicep' = if (createEntraApp) {
  name: 'entra-app'
  params: {
    location: location
    tags: tags
    appDisplayName: 'Nebula Forge Portal'
    portalRedirectUri: 'https://placeholder-${resourceToken}.example.com'
    managedIdentityId: identity.outputs.managedIdentityId
    deploymentScriptName: 'ds-entra-${resourceToken}'
  }
}

module mcpApps 'modules/containerapp-mcp.bicep' = [for agent in mcpAgents: {
  name: 'mcp-${agent.serviceName}'
  params: {
    location: location
    tags: union(tags, { 'azd-service-name': agent.serviceName })
    name: 'ca-${agent.serviceName}-${resourceToken}'
    image: mcpImageMap[agent.serviceName]
    targetPort: agent.port
    agentName: agent.name
    containerAppsEnvId: containerAppsEnv.outputs.environmentId
    managedIdentityId: identity.outputs.managedIdentityId
    registryServer: registry.outputs.loginServer
    storageAccountName: storage.outputs.storageAccountName
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
  }
}]

var caEnvDomain = containerAppsEnv.outputs.defaultDomain

// Compute the portal's external FQDN deterministically so the API module can
// lock CORS to it without a circular dependency on the portal module.
var portalFqdn = 'ca-portal-${resourceToken}.${caEnvDomain}'

// The single Entra app reg used by both Easy Auth (portal) and JWT verification (API).
var effectiveEntraClientId = !empty(aadClientId) ? aadClientId : (createEntraApp ? entraApp!.outputs.appId : '')

module apiApp 'modules/containerapp-api.bicep' = {
  name: 'api-app'
  params: {
    location: location
    tags: union(tags, { 'azd-service-name': 'api' })
    name: 'ca-api-${resourceToken}'
    image: !empty(apiImageName) ? apiImageName : placeholderImage
    containerAppsEnvId: containerAppsEnv.outputs.environmentId
    managedIdentityId: identity.outputs.managedIdentityId
    managedIdentityClientId: identity.outputs.managedIdentityClientId
    managedIdentityName: identity.outputs.managedIdentityName
    registryServer: registry.outputs.loginServer
    storageAccountName: storage.outputs.storageAccountName
    openAiEndpoint: openai.outputs.endpoint
    openAiDeploymentName: openai.outputs.deploymentName
    aiProjectEndpoint: foundry.outputs.projectEndpoint
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    entraTenantId: subscription().tenantId
    entraClientId: effectiveEntraClientId
    portalFqdn: portalFqdn
    extraAllowedOrigins: [for h in customDomainHostnames: 'https://${h}']
    authEnabled: authEnabled
    proxySharedSecret: proxySharedSecret
    caEnvDefaultDomain: caEnvDomain
    postgresHost: !empty(principalId) ? postgres!.outputs.serverFqdn : ''
    postgresDatabase: !empty(principalId) ? postgres!.outputs.databaseName : ''
    resourceToken: resourceToken
    mcpAgents: mcpAgents
  }
  dependsOn: [
    mcpApps
  ]
}

module portalApp 'modules/containerapp-portal.bicep' = {
  name: 'portal-app'
  params: {
    location: location
    tags: union(tags, { 'azd-service-name': 'portal' })
    name: 'ca-portal-${resourceToken}'
    image: !empty(portalImageName) ? portalImageName : placeholderImage
    containerAppsEnvId: containerAppsEnv.outputs.environmentId
    managedIdentityId: identity.outputs.managedIdentityId
    managedIdentityClientId: identity.outputs.managedIdentityClientId
    registryServer: registry.outputs.loginServer
    apiBaseUrl: 'https://${apiApp.outputs.fqdn}'
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    entraTenantId: subscription().tenantId
    entraClientId: effectiveEntraClientId
    authEnabled: authEnabled
    aadClientSecret: aadClientSecret
    proxySharedSecret: proxySharedSecret
    customDomains: portalCustomDomains
  }
}

module diagnostics 'modules/diagnostics.bicep' = {
  name: 'diagnostics'
  params: {
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    storageAccountName: storage.outputs.storageAccountName
    keyVaultName: foundry.outputs.keyVaultName
    registryName: registry.outputs.registryName
    openAiAccountName: openai.outputs.accountName
  }
}

// PostgreSQL Flexible Server for the HR screening pipeline (`candidates` table).
// AAD-only auth: the developer is the Postgres AAD admin (set in bicep), and
// the runtime MI gets a least-privileged DB role applied by a one-shot
// bootstrap script (`infra/postgres-bootstrap.ps1`).
module postgres 'modules/postgres.bicep' = if (!empty(principalId)) {
  name: 'postgres'
  params: {
    location: location
    tags: tags
    serverName: 'psql-nf-${resourceToken}'
    databaseName: 'nebulaforge'
    adminPrincipalId: principalId
    adminPrincipalName: !empty(principalName) ? principalName : principalId
    adminPrincipalType: principalType
    tenantId: subscription().tenantId
  }
}

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = registry.outputs.loginServer
output AZURE_CONTAINER_REGISTRY_NAME string = registry.outputs.registryName
output AZURE_CONTAINER_APPS_ENVIRONMENT_ID string = containerAppsEnv.outputs.environmentId
output AZURE_CONTAINER_APPS_ENVIRONMENT_DEFAULT_DOMAIN string = containerAppsEnv.outputs.defaultDomain

output AZURE_STORAGE_ACCOUNT_NAME string = storage.outputs.storageAccountName

output AZURE_OPENAI_ENDPOINT string = openai.outputs.endpoint
output AZURE_OPENAI_DEPLOYMENT_NAME string = openai.outputs.deploymentName
output AI_PROJECT_ENDPOINT string = foundry.outputs.projectEndpoint

output AZURE_MANAGED_IDENTITY_CLIENT_ID string = identity.outputs.managedIdentityClientId
output AZURE_MANAGED_IDENTITY_ID string = identity.outputs.managedIdentityId

output API_FQDN string = apiApp.outputs.fqdn
output API_BASE_URL string = 'https://${apiApp.outputs.fqdn}'
output PORTAL_FQDN string = portalApp.outputs.fqdn
output PORTAL_BASE_URL string = 'https://${portalApp.outputs.fqdn}'

output AZURE_ENTRA_CLIENT_ID string = effectiveEntraClientId
output AZURE_ENTRA_TENANT_ID string = subscription().tenantId

output PSQL_HOST string = !empty(principalId) ? postgres!.outputs.serverFqdn : ''
output PSQL_DATABASE string = !empty(principalId) ? postgres!.outputs.databaseName : ''
