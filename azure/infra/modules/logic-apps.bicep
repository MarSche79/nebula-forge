@description('Azure region')
param location string

@description('Resource tags')
param tags object

@description('Log Analytics workspace customer (workspace) ID')
param logAnalyticsWorkspaceId string

@description('Log Analytics primary shared key')
@secure()
param logAnalyticsPrimarySharedKey string

@description('Workflow name for the Defender custom-table ingest flow')
param workflowName string

// Stateless Logic App that accepts a webhook POST and pushes the body into a
// Log Analytics custom table (NebulaForgeAgentSignals_CL). A custom Defender
// XDR / Sentinel detection rule then surfaces incidents from this table.
resource workflow 'Microsoft.Logic/workflows@2019-05-01' = {
  name: workflowName
  location: location
  tags: tags
  properties: {
    state: 'Enabled'
    definition: {
      '$schema': 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#'
      contentVersion: '1.0.0.0'
      parameters: {
        '$connections': {
          defaultValue: {}
          type: 'Object'
        }
        WorkspaceCustomerId: {
          defaultValue: logAnalyticsWorkspaceId
          type: 'String'
        }
        WorkspaceSharedKey: {
          defaultValue: logAnalyticsPrimarySharedKey
          type: 'SecureString'
        }
      }
      triggers: {
        webhook: {
          type: 'Request'
          kind: 'Http'
          inputs: {
            schema: {
              type: 'object'
              properties: {
                eventType:    { type: 'string' }
                user:         { type: 'string' }
                detail:       { type: 'string' }
                demo:         { type: 'boolean' }
                emittedAt:    { type: 'string' }
              }
              required: [ 'eventType' ]
            }
          }
        }
      }
      actions: {
        Send_to_LogAnalytics: {
          type: 'ApiConnection'
          inputs: {
            host: {
              connection: {
                name: '@parameters(\'$connections\')[\'azureloganalyticsdatacollector\'][\'connectionId\']'
              }
            }
            method: 'post'
            path: '/api/logs'
            body: '@triggerBody()'
            headers: {
              'Log-Type': 'NebulaForgeAgentSignals'
            }
          }
        }
      }
      outputs: {}
    }
  }
}

// Note: The Log Analytics Data Collector API connection must be created /
// authorised manually after first deploy (it requires a one-time consent
// against the workspace shared key). The MANUAL-SETUP.md walks the operator
// through this — it's a single click in the portal.

output workflowId string = workflow.id
output workflowName string = workflow.name
output triggerCallbackUrl string = listCallbackURL('${workflow.id}/triggers/webhook', '2019-05-01').value
