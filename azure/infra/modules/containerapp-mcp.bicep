@description('Azure region')
param location string

@description('Resource tags (must include azd-service-name)')
param tags object

@description('Container app name')
param name string

@description('Container image to deploy initially (placeholder until azd deploy)')
param image string

@description('Target ingress port for this MCP server')
param targetPort int

@description('Logical agent name (e.g. nebula-hr)')
param agentName string

@description('Container Apps environment resource ID')
param containerAppsEnvId string

@description('User-assigned managed identity resource ID')
param managedIdentityId string

@description('ACR login server (e.g. myacr.azurecr.io)')
param registryServer string

@description('Storage account name (passed as env var)')
param storageAccountName string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Optional: API base URL the agent uses to post activity callbacks (internal FQDN)')
param apiInternalUrl string = ''

@description('Optional: shared secret for activity callback authentication')
@secure()
param agentCallbackSecret string = ''

@description('Optional: Azure OpenAI endpoint (used by whisperer)')
param openAiEndpoint string = ''

@description('Optional: Azure OpenAI deployment name (used by whisperer)')
param openAiDeploymentName string = ''

@description('Optional: Power Automate Teams post webhook')
@secure()
param paTeamsWebhook string = ''

@description('Optional: Power Automate Comm. Compliance trigger webhook')
@secure()
param paCcWebhook string = ''

@description('Optional: Power Automate SharePoint create-doc webhook')
@secure()
param paSpCreateWebhook string = ''

@description('Optional: Power Automate SharePoint apply-label webhook')
@secure()
param paSpLabelWebhook string = ''

@description('Optional: Logic App callback URL for the Defender custom-table ingest')
@secure()
param laDefenderWebhook string = ''

var hasCallbackSecret = !empty(agentCallbackSecret)
var hasPaTeams        = !empty(paTeamsWebhook)
var hasPaCc           = !empty(paCcWebhook)
var hasPaSpCreate     = !empty(paSpCreateWebhook)
var hasPaSpLabel      = !empty(paSpLabelWebhook)
var hasLaDefender     = !empty(laDefenderWebhook)

var optionalSecrets = concat(
  hasCallbackSecret ? [ { name: 'agent-callback-secret', value: agentCallbackSecret } ] : [],
  hasPaTeams        ? [ { name: 'pa-teams-webhook',      value: paTeamsWebhook } ]      : [],
  hasPaCc           ? [ { name: 'pa-cc-webhook',         value: paCcWebhook } ]         : [],
  hasPaSpCreate     ? [ { name: 'pa-sp-create-webhook',  value: paSpCreateWebhook } ]   : [],
  hasPaSpLabel      ? [ { name: 'pa-sp-label-webhook',   value: paSpLabelWebhook } ]    : [],
  hasLaDefender     ? [ { name: 'la-defender-webhook',   value: laDefenderWebhook } ]   : []
)

var optionalEnv = concat(
  !empty(apiInternalUrl)        ? [ { name: 'API_INTERNAL_URL',            value: apiInternalUrl } ]                : [],
  !empty(openAiEndpoint)        ? [ { name: 'AZURE_OPENAI_ENDPOINT',       value: openAiEndpoint } ]                : [],
  !empty(openAiDeploymentName)  ? [ { name: 'AZURE_OPENAI_DEPLOYMENT_NAME',value: openAiDeploymentName } ]          : [],
  hasCallbackSecret             ? [ { name: 'AGENT_CALLBACK_SECRET',       secretRef: 'agent-callback-secret' } ]   : [],
  hasPaTeams                    ? [ { name: 'PA_TEAMS_WEBHOOK',            secretRef: 'pa-teams-webhook' } ]        : [],
  hasPaCc                       ? [ { name: 'PA_CC_WEBHOOK',               secretRef: 'pa-cc-webhook' } ]           : [],
  hasPaSpCreate                 ? [ { name: 'PA_SP_CREATE_WEBHOOK',        secretRef: 'pa-sp-create-webhook' } ]    : [],
  hasPaSpLabel                  ? [ { name: 'PA_SP_LABEL_WEBHOOK',         secretRef: 'pa-sp-label-webhook' } ]     : [],
  hasLaDefender                 ? [ { name: 'LA_DEFENDER_WEBHOOK',         secretRef: 'la-defender-webhook' } ]     : []
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
      secrets: optionalSecrets
      ingress: {
        external: false
        targetPort: targetPort
        transport: 'auto'
        allowInsecure: false
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
          name: 'mcp'
          image: image
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: concat([
            { name: 'AGENT_NAME',                    value: agentName }
            { name: 'AGENT_PORT',                    value: string(targetPort) }
            { name: 'PORT',                          value: string(targetPort) }
            { name: 'AZURE_STORAGE_ACCOUNT_NAME',    value: storageAccountName }
            { name: 'AZURE_CLIENT_ID',               value: reference(managedIdentityId, '2023-01-31').clientId }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
          ], optionalEnv)
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/health'
                port: targetPort
                scheme: 'HTTP'
              }
              initialDelaySeconds: 5
              periodSeconds: 5
              timeoutSeconds: 5
              failureThreshold: 24
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: targetPort
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: targetPort
                scheme: 'HTTP'
              }
              initialDelaySeconds: 2
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
      }
    }
  }
}

output appId string = app.id
output name string = app.name
output fqdn string = app.properties.configuration.ingress.fqdn
