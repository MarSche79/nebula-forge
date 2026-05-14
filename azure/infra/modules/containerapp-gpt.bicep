@description('Azure region')
param location string

@description('Resource tags')
param tags object

@description('Container app name')
param name string

@description('Container image')
param image string

@description('Container Apps environment resource ID')
param containerAppsEnvId string

@description('User-assigned managed identity resource ID')
param managedIdentityId string

@description('Managed identity client ID')
param managedIdentityClientId string

@description('ACR login server')
param registryServer string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Azure OpenAI endpoint')
param openAiEndpoint string

@description('Azure OpenAI gpt-4o deployment name')
param openAiDeploymentName string

@description('Entra tenant ID (used for OBO)')
param entraTenantId string

@description('Easy Auth Entra app client ID (audience of inbound user tokens)')
param entraClientId string

@description('Dedicated NebulaGPT Entra app reg client ID (used for OBO assertion)')
param gptAppClientId string

@description('Dedicated NebulaGPT Entra app client secret (used for OBO assertion)')
@secure()
param gptAppClientSecret string

@description('Allowed tenant ID — tid claim must match (single-tenant lock)')
param allowedTenantId string

@description('Portal FQDN (for CORS lock)')
param portalFqdn string

@description('Proxy shared secret (defence in depth)')
@secure()
param proxySharedSecret string

@description('Postgres server FQDN')
param postgresHost string

@description('Postgres database')
param postgresDatabase string

@description('Postgres user (= managed identity display name)')
param managedIdentityName string

@description('Power Automate save-doc webhook (saves generated/uploaded files to SharePoint)')
@secure()
param paSaveDocWebhook string = ''

@description('SharePoint site URL for uploads + generated docs')
param sharepointSiteUrl string = ''

@description('Uploads document library name')
param uploadsLibrary string = 'NebulaGPT-Uploads'

@description('Whether to enable WorkIQ MCP subprocess')
param workiqEnabled bool = true

var hasGptSecret    = !empty(gptAppClientSecret)
var hasProxySecret  = !empty(proxySharedSecret)
var hasSaveDocHook  = !empty(paSaveDocWebhook)

var allSecrets = concat(
  hasGptSecret    ? [ { name: 'gpt-app-client-secret', value: gptAppClientSecret } ] : [],
  hasProxySecret  ? [ { name: 'proxy-shared-secret',   value: proxySharedSecret } ]  : [],
  hasSaveDocHook  ? [ { name: 'pa-save-doc-webhook',   value: paSaveDocWebhook } ]   : []
)

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
      secrets: allSecrets
      ingress: {
        external: false
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
        corsPolicy: {
          allowedOrigins: [ 'https://${portalFqdn}' ]
          allowedMethods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS']
          allowedHeaders: ['*']
          allowCredentials: true
        }
        traffic: [ { latestRevision: true, weight: 100 } ]
      }
      registries: [ { server: registryServer, identity: managedIdentityId } ]
    }
    template: {
      containers: [
        {
          name: 'gpt'
          image: image
          resources: { cpu: json('1.0'), memory: '2.0Gi' }
          env: concat([
            { name: 'PORT',                                  value: '3000' }
            { name: 'AZURE_CLIENT_ID',                       value: managedIdentityClientId }
            { name: 'AZURE_OPENAI_ENDPOINT',                 value: openAiEndpoint }
            { name: 'AZURE_OPENAI_DEPLOYMENT_4O',            value: openAiDeploymentName }
            { name: 'AZURE_OPENAI_DEPLOYMENT_NAME',          value: openAiDeploymentName }
            { name: 'ENTRA_TENANT_ID',                       value: entraTenantId }
            { name: 'ENTRA_CLIENT_ID',                       value: entraClientId }
            { name: 'GPT_APP_CLIENT_ID',                     value: gptAppClientId }
            { name: 'ALLOWED_TENANT_ID',                     value: allowedTenantId }
            { name: 'PORTAL_ORIGIN',                         value: 'https://${portalFqdn}' }
            { name: 'PSQL_HOST',                             value: postgresHost }
            { name: 'PSQL_DATABASE',                         value: postgresDatabase }
            { name: 'PSQL_USER',                             value: managedIdentityName }
            { name: 'WORKIQ_ENABLED',                        value: string(workiqEnabled) }
            { name: 'WORKIQ_COMMAND',                        value: 'workiq' }
            { name: 'WORKIQ_ARGS',                           value: 'mcp' }
            { name: 'SHAREPOINT_SITE_URL',                   value: sharepointSiteUrl }
            { name: 'UPLOADS_LIBRARY',                       value: uploadsLibrary }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
          ],
          hasGptSecret    ? [ { name: 'GPT_APP_CLIENT_SECRET', secretRef: 'gpt-app-client-secret' } ] : [],
          hasProxySecret  ? [ { name: 'PROXY_SHARED_SECRET',   secretRef: 'proxy-shared-secret' } ]   : [],
          hasSaveDocHook  ? [ { name: 'PA_SAVE_DOC_WEBHOOK',   secretRef: 'pa-save-doc-webhook' } ]   : [])
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 5 }
    }
  }
}

output appId string = app.id
output name string = app.name
output fqdn string = app.properties.configuration.ingress.fqdn
