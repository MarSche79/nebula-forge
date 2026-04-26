@description('Azure region')
param location string

@description('Resource tags (must include azd-service-name=portal)')
param tags object

@description('Container app name')
param name string

@description('Container image to deploy initially (placeholder until azd deploy)')
param image string

@description('Container Apps environment resource ID')
param containerAppsEnvId string

@description('User-assigned managed identity resource ID')
param managedIdentityId string

@description('Managed identity client ID')
param managedIdentityClientId string

@description('ACR login server')
param registryServer string

@description('Public base URL of the Backend API (e.g. https://ca-api-xxx.westeurope.azurecontainerapps.io)')
param apiBaseUrl string

@description('App Insights connection string')
param appInsightsConnectionString string

@description('Entra tenant ID')
param entraTenantId string

@description('Entra app client ID used by Easy Auth (must be non-empty when authEnabled=true)')
param entraClientId string

@description('Whether to enable Container Apps built-in authentication (Easy Auth) on the portal')
param authEnabled bool = false

@description('AAD client secret value for Easy Auth — passed as a secure parameter, stored as a Container Apps secret. Required when authEnabled=true.')
@secure()
param aadClientSecret string = ''

@description('Shared secret between portal and API for the proxy trust boundary. Stored as a CA secret on both apps.')
@secure()
param proxySharedSecret string = ''

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
      secrets: concat(
        authEnabled ? [
          {
            name: 'aad-client-secret'
            value: aadClientSecret
          }
        ] : [],
        !empty(proxySharedSecret) ? [
          {
            name: 'proxy-shared-secret'
            value: proxySharedSecret
          }
        ] : []
      )
      ingress: {
        external: true
        targetPort: 3000
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
          name: 'portal'
          image: image
          resources: {
            cpu: json('0.5')
            memory: '1.0Gi'
          }
          env: concat(
            [
              { name: 'PORT',                                  value: '3000' }
              { name: 'AZURE_CLIENT_ID',                       value: managedIdentityClientId }
              { name: 'API_BASE_URL',                          value: apiBaseUrl }
              // Intentionally empty: forces the browser to use same-origin /api/* via the Next.js proxy.
              // Public exposure of API_BASE_URL would let clients bypass the proxy + Easy Auth.
              { name: 'NEXT_PUBLIC_API_URL',                   value: '' }
              { name: 'NEXT_PUBLIC_ENTRA_TENANT_ID',           value: entraTenantId }
              { name: 'NEXT_PUBLIC_ENTRA_CLIENT_ID',           value: entraClientId }
              { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
            ],
            !empty(proxySharedSecret) ? [
              { name: 'PROXY_SHARED_SECRET', secretRef: 'proxy-shared-secret' }
            ] : []
          )
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 5
      }
    }
  }
}

// Container Apps built-in authentication ("Easy Auth") with Microsoft Entra.
// When enabled, anonymous requests are redirected to AAD login. Easy Auth
// always injects X-MS-CLIENT-PRINCIPAL* headers (used for user identity).
// Token store is disabled because it requires a SAS-backed blob, which is
// incompatible with our shared-key-disabled storage account.
resource auth 'Microsoft.App/containerApps/authConfigs@2024-03-01' = if (authEnabled) {
  parent: app
  name: 'current'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      // The site has a public landing page. Pages that require sign-in
      // are gated by Next.js middleware (which redirects to
      // /.auth/login/aad when there is no Easy Auth principal).
      unauthenticatedClientAction: 'AllowAnonymous'
      redirectToProvider: 'azureactivedirectory'
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: entraClientId
          clientSecretSettingName: 'aad-client-secret'
          openIdIssuer: 'https://login.microsoftonline.com/${entraTenantId}/v2.0'
        }
        validation: {
          allowedAudiences: [
            'api://${entraClientId}'
            entraClientId
          ]
        }
      }
    }
    login: {
      tokenStore: {
        enabled: false
      }
      preserveUrlFragmentsForLogins: false
    }
  }
}

output appId string = app.id
output name string = app.name
output fqdn string = app.properties.configuration.ingress.fqdn
