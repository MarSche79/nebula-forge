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

@description('Whether to deploy a second gpt-4o (full) deployment for richer document generation')
param deployGpt4o bool = false

@description('Capacity for the gpt-4o (full) deployment when deployGpt4o = true')
param gpt4oCapacity int = 30

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

resource gpt4o 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = if (deployGpt4o) {
  parent: account
  name: 'gpt-4o'
  sku: {
    name: 'GlobalStandard'
    capacity: gpt4oCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4o'
      version: '2024-11-20'
    }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
    raiPolicyName: 'Microsoft.DefaultV2'
  }
  dependsOn: [
    deployment
  ]
}

output accountId string = account.id
output accountName string = account.name
output endpoint string = account.properties.endpoint
output deploymentName string = deployment.name
output gpt4oDeploymentName string = deployGpt4o ? gpt4o.name : ''
