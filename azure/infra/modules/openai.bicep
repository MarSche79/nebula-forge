@description('Azure region')
param location string

@description('Resource tags')
param tags object

@description('Azure OpenAI account name')
param accountName string

@description('Model deployment name')
param deploymentName string = 'gpt-4o-mini'

@description('Underlying model name')
param modelName string = 'gpt-4o-mini'

@description('Model version')
param modelVersion string = '2024-07-18'

@description('Capacity (TPM in thousands) for GlobalStandard SKU')
param capacity int = 50

resource account 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: accountName
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: accountName
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: true
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

resource deployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: account
  name: deploymentName
  sku: {
    name: 'GlobalStandard'
    capacity: capacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
    raiPolicyName: 'Microsoft.DefaultV2'
  }
}

output accountId string = account.id
output accountName string = account.name
output endpoint string = account.properties.endpoint
output deploymentName string = deployment.name
