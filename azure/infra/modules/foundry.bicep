@description('Azure region')
param location string

@description('Resource tags')
param tags object

@description('AI Foundry Hub name')
param hubName string

@description('AI Foundry Project name')
param projectName string

@description('Resource ID of an existing storage account')
param storageAccountId string

@description('Resource ID of Application Insights')
param appInsightsId string

@description('Resource ID of the container registry')
param containerRegistryId string

@description('Resource ID of the Azure OpenAI account to connect to')
param openAiAccountId string

@description('Name of the Azure OpenAI account to connect to')
param openAiAccountName string

@description('Endpoint of the Azure OpenAI account')
param openAiEndpoint string

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: take('kv-${uniqueString(resourceGroup().id, hubName)}', 24)
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enablePurgeProtection: true
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
    }
  }
}

resource hub 'Microsoft.MachineLearningServices/workspaces@2024-10-01' = {
  name: hubName
  location: location
  tags: tags
  kind: 'Hub'
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'Basic'
    tier: 'Basic'
  }
  properties: {
    friendlyName: 'Nebula Forge AI Hub'
    description: 'AI Foundry Hub for Nebula Forge'
    storageAccount: storageAccountId
    keyVault: keyVault.id
    applicationInsights: appInsightsId
    containerRegistry: containerRegistryId
    publicNetworkAccess: 'Enabled'
    hbiWorkspace: false
    v1LegacyMode: false
  }
}

resource openAiConnection 'Microsoft.MachineLearningServices/workspaces/connections@2024-10-01' = {
  parent: hub
  name: 'aoai-${openAiAccountName}'
  properties: {
    category: 'AzureOpenAI'
    target: openAiEndpoint
    authType: 'AAD'
    isSharedToAll: true
    metadata: {
      ApiType: 'Azure'
      ResourceId: openAiAccountId
      ApiVersion: '2024-10-21'
    }
  }
}

resource project 'Microsoft.MachineLearningServices/workspaces@2024-10-01' = {
  name: projectName
  location: location
  tags: tags
  kind: 'Project'
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'Basic'
    tier: 'Basic'
  }
  properties: {
    friendlyName: 'Nebula Forge AI Project'
    description: 'AI Foundry Project for Nebula Forge'
    hubResourceId: hub.id
    publicNetworkAccess: 'Enabled'
  }
}

output hubId string = hub.id
output hubName string = hub.name
output keyVaultName string = keyVault.name
output projectId string = project.id
output projectName string = project.name
// Foundry connection string format: <region>.api.azureml.ms;<sub>;<rg>;<project>
output projectConnectionString string = '${location}.api.azureml.ms;${subscription().subscriptionId};${resourceGroup().name};${project.name}'
// Fallback: discovery URL the workspace exposes
output projectEndpoint string = project.properties.discoveryUrl
