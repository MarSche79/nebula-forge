@description('Azure region')
param location string

@description('Resource tags (must include azd-service-name=api)')
param tags object

@description('Container app name')
param name string

@description('Container image to deploy initially (placeholder until azd deploy)')
param image string

@description('Container Apps environment resource ID')
param containerAppsEnvId string

@description('User-assigned managed identity resource ID')
param managedIdentityId string

@description('Managed identity client ID (for AZURE_CLIENT_ID env var)')
param managedIdentityClientId string

@description('ACR login server')
param registryServer string

@description('Storage account name')
param storageAccountName string

@description('Azure OpenAI endpoint')
param openAiEndpoint string

@description('Azure OpenAI deployment name')
param openAiDeploymentName string

@description('AI Foundry project endpoint')
param aiProjectEndpoint string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Entra tenant ID')
param entraTenantId string

@description('Entra app client ID (may be empty if app reg deferred)')
param entraClientId string

@description('Portal FQDN — used to lock CORS to the portal origin.')
param portalFqdn string

@description('Optional list of additional allowed CORS origins (e.g. custom domains). Each must be a full https:// URL.')
param extraAllowedOrigins array = []

@description('Whether portal authentication (Easy Auth) is enabled. Enables AUTH_ENABLED on the API.')
param authEnabled bool = false

@description('Shared secret between portal and API for the proxy trust boundary. Stored as a CA secret on both apps.')
@secure()
param proxySharedSecret string = ''

@description('Postgres server FQDN. When non-empty, exposes PSQL_HOST/DB env to the API.')
param postgresHost string = ''

@description('Postgres database name.')
param postgresDatabase string = ''

@description('Managed identity name (Postgres role name = AAD principal display name).')
param managedIdentityName string

@description('Container Apps environment default domain (used to compute internal MCP URLs)')
param caEnvDefaultDomain string

@description('Resource token used in MCP container app names')
param resourceToken string

@description('List of MCP agents: [{ serviceName, port }]')
param mcpAgents array

var mcpUrlVars = [for agent in mcpAgents: {
  name: 'MCP_${toUpper(replace(agent.serviceName, '-', '_'))}_URL'
  value: 'https://ca-${agent.serviceName}-${resourceToken}.internal.${caEnvDefaultDomain}'
}]

var baseEnv = [
  { name: 'PORT',                                  value: '3000' }
  { name: 'AZURE_STORAGE_ACCOUNT_NAME',            value: storageAccountName }
  { name: 'AZURE_CLIENT_ID',                       value: managedIdentityClientId }
  { name: 'AZURE_OPENAI_ENDPOINT',                 value: openAiEndpoint }
  { name: 'AZURE_OPENAI_DEPLOYMENT_NAME',          value: openAiDeploymentName }
  { name: 'AI_PROJECT_ENDPOINT',                   value: aiProjectEndpoint }
  { name: 'ENTRA_TENANT_ID',                       value: entraTenantId }
  { name: 'ENTRA_CLIENT_ID',                       value: entraClientId }
  { name: 'AUTH_ENABLED',                          value: string(authEnabled) }
  { name: 'PORTAL_ORIGIN',                         value: 'https://${portalFqdn}' }
  { name: 'PSQL_HOST',                             value: postgresHost }
  { name: 'PSQL_DATABASE',                         value: postgresDatabase }
  { name: 'PSQL_USER',                             value: managedIdentityName }
  { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
]

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityId}': {}
    }
  }
  properties: {
    environmentId: containerAppsEnvId
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: !empty(proxySharedSecret) ? [
        {
          name: 'proxy-shared-secret'
          value: proxySharedSecret
        }
      ] : []
      ingress: {
        external: false
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
        corsPolicy: {
          allowedOrigins: union([ 'https://${portalFqdn}' ], extraAllowedOrigins)
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
          allowedHeaders: ['*']
          allowCredentials: true
        }
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: registryServer
          identity: managedIdentityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: image
          resources: {
            cpu: json('0.5')
            memory: '1.0Gi'
          }
          env: concat(baseEnv, mcpUrlVars, !empty(proxySharedSecret) ? [
            { name: 'PROXY_SHARED_SECRET', secretRef: 'proxy-shared-secret' }
          ] : [])
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 5
      }
    }
  }
}

output appId string = app.id
output name string = app.name
output fqdn string = app.properties.configuration.ingress.fqdn
