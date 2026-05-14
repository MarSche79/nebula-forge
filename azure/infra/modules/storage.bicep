@description('Azure region')
param location string

@description('Resource tags')
param tags object

@minLength(2)
@maxLength(24)
@description('Storage account name')
param storageAccountName string

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    // Re-enabled because Easy Auth's tokenStore on Container Apps uses a SAS
    // URL (shared key), and there is no managed-identity path for it yet.
    // SAS keys are scoped + time-limited and the storage account is firewalled.
    allowSharedKeyAccess: true
    allowCrossTenantReplication: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
  properties: {}
}

var defaultTables = [
  'crew'
  'missions'
  'inventory'
  'logs'
]

resource tables 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = [for tbl in defaultTables: {
  parent: tableService
  name: tbl
}]

output storageAccountId string = storageAccount.id
output storageAccountName string = storageAccount.name
output tableEndpoint string = storageAccount.properties.primaryEndpoints.table
