@description('Azure region')
param location string

@description('Resource tags')
param tags object

@description('Container Apps environment resource name')
param environmentNameResource string

@description('Log Analytics customer (workspace) ID')
param logAnalyticsCustomerId string

@description('Log Analytics primary shared key')
@secure()
param logAnalyticsPrimarySharedKey string

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentNameResource
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsPrimarySharedKey
      }
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    zoneRedundant: false
  }
}

output environmentId string = environment.id
output environmentName string = environment.name
output defaultDomain string = environment.properties.defaultDomain
