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
          env: [
            { name: 'AGENT_NAME',                    value: agentName }
            { name: 'AGENT_PORT',                    value: string(targetPort) }
            { name: 'PORT',                          value: string(targetPort) }
            { name: 'AZURE_STORAGE_ACCOUNT_NAME',    value: storageAccountName }
            { name: 'AZURE_CLIENT_ID',               value: reference(managedIdentityId, '2023-01-31').clientId }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
          ]
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
