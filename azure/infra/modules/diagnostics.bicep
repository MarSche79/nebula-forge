@description('Log Analytics workspace resource ID to send diagnostics to.')
param logAnalyticsWorkspaceId string

@description('Storage account name to enable diagnostics on.')
param storageAccountName string

@description('Key Vault name to enable diagnostics on.')
param keyVaultName string

@description('Container Registry name to enable diagnostics on.')
param registryName string

@description('Azure OpenAI account name to enable diagnostics on.')
param openAiAccountName string

resource sa 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource saTableSvc 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' existing = {
  parent: sa
  name: 'default'
}

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource oai 'Microsoft.CognitiveServices/accounts@2023-05-01' existing = {
  name: openAiAccountName
}

// Storage account → Table service-level data-plane diagnostics
// (We only use Tables; blob/queue/file diagnostics omitted to keep cost down.)
resource saTableDiag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'diag-to-la'
  scope: saTableSvc
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      { category: 'StorageRead',   enabled: true }
      { category: 'StorageWrite',  enabled: true }
      { category: 'StorageDelete', enabled: true }
    ]
    metrics: [
      { category: 'Transaction', enabled: true }
    ]
  }
}

resource kvDiag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'diag-to-la'
  scope: kv
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      { categoryGroup: 'audit',   enabled: true }
      { categoryGroup: 'allLogs', enabled: true }
    ]
    metrics: [
      { category: 'AllMetrics', enabled: true }
    ]
  }
}

resource acrDiag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'diag-to-la'
  scope: acr
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      { category: 'ContainerRegistryRepositoryEvents', enabled: true }
      { category: 'ContainerRegistryLoginEvents',      enabled: true }
    ]
    metrics: [
      { category: 'AllMetrics', enabled: true }
    ]
  }
}

resource oaiDiag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'diag-to-la'
  scope: oai
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      { categoryGroup: 'audit',   enabled: true }
      { categoryGroup: 'allLogs', enabled: true }
    ]
    metrics: [
      { category: 'AllMetrics', enabled: true }
    ]
  }
}
