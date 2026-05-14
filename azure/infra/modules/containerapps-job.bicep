@description('Azure region')
param location string

@description('Resource tags (must include azd-service-name=agent-tick)')
param tags object

@description('Container app job name')
param name string

@description('Container image to run on schedule')
param image string

@description('Container Apps environment resource ID')
param containerAppsEnvId string

@description('User-assigned managed identity resource ID')
param managedIdentityId string

@description('User-assigned managed identity client ID')
param managedIdentityClientId string

@description('ACR login server')
param registryServer string

@description('CRON expression — defaults to every 30 minutes')
param cronExpression string = '*/30 * * * *'

@description('Internal API base URL (https://ca-api-…internal.<env>) — agent posts activity here')
param apiInternalUrl string

@description('Shared secret used by the cron job to authenticate to /api/board/activity callbacks')
@secure()
param agentCallbackSecret string

@description('Map of MCP service URLs that the tick job will call')
param mcpUrls object

resource job 'Microsoft.App/jobs@2024-03-01' = {
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
      triggerType: 'Schedule'
      replicaTimeout: 600
      replicaRetryLimit: 1
      scheduleTriggerConfig: {
        cronExpression: cronExpression
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: [
        {
          server: registryServer
          identity: managedIdentityId
        }
      ]
      secrets: [
        {
          name: 'agent-callback-secret'
          value: agentCallbackSecret
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'tick'
          image: image
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'AZURE_CLIENT_ID',          value: managedIdentityClientId }
            { name: 'API_INTERNAL_URL',         value: apiInternalUrl }
            { name: 'AGENT_CALLBACK_SECRET',    secretRef: 'agent-callback-secret' }
            { name: 'MCP_SCRIBE_URL',           value: mcpUrls.scribe }
            { name: 'MCP_HERALD_URL',           value: mcpUrls.herald }
            { name: 'MCP_SENTINEL_URL',         value: mcpUrls.sentinel }
            { name: 'MCP_AUDITOR_URL',          value: mcpUrls.auditor }
            { name: 'MCP_WHISPERER_URL',        value: mcpUrls.whisperer }
          ]
        }
      ]
    }
  }
}

output jobId string = job.id
output jobName string = job.name
