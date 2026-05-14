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

@description('Internal GPT base URL (https://ca-gpt-…internal.<env>)')
param gptBaseUrl string = ''

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

@description('Optional custom hostname bindings (e.g. www.nebula-forge.at) with their managed-cert names.')
param customDomains array = []

@description('Storage account name (used for the Easy Auth tokenStore blob container)')
param storageAccountName string = ''

@description('SAS expiry timestamp for the Easy Auth tokenStore SAS — must be a future ISO-8601 timestamp. Default is one year from provision time.')
param tokenStoreSasExpiry string = dateTimeAdd(utcNow('yyyy-MM-ddTHH:mm:ssZ'), 'P1Y')

// Reference the existing storage account to read its account key for the
// Easy Auth tokenStore SAS URL.
resource storageAcct 'Microsoft.Storage/storageAccounts@2023-05-01' existing = if (authEnabled && !empty(storageAccountName)) {
  name: storageAccountName
}

var tokenStoreSasParams = {
  signedServices: 'b'
  signedResourceTypes: 'sco'
  signedPermission: 'rwdlacu'
  signedExpiry: tokenStoreSasExpiry
  signedProtocol: 'https'
}
var tokenStoreSasUrl = (authEnabled && !empty(storageAccountName))
  ? '${storageAcct.properties.primaryEndpoints.blob}easy-auth-token-store?${listAccountSas(storageAcct.id, '2023-05-01', tokenStoreSasParams).accountSasToken}'
  : ''

// Pre-create the blob container so Easy Auth doesn't have to.
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' existing = if (authEnabled && !empty(storageAccountName)) {
  parent: storageAcct
  name: 'default'
}
resource tokenStoreContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = if (authEnabled && !empty(storageAccountName)) {
  parent: blobService
  name: 'easy-auth-token-store'
  properties: {
    publicAccess: 'None'
  }
}

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
        (authEnabled && !empty(storageAccountName)) ? [
          {
            name: 'auth-token-store-sas'
            value: tokenStoreSasUrl
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
        // Custom hostname bindings (e.g. www.nebula-forge.at). The managed
        // certificates themselves are created out-of-band (the apex needs DNS
        // to propagate first); we only declare the binding here so subsequent
        // azd provisions don't strip it.
        customDomains: [for d in customDomains: {
          name: d.hostname
          bindingType: 'SniEnabled'
          certificateId: d.certificateId
        }]
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
              { name: 'GPT_BASE_URL',                          value: gptBaseUrl }
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
        login: {
          // Request a Microsoft Graph access token at sign-in so the portal's
          // Easy Auth sidecar exposes it via X-MS-TOKEN-AAD-ACCESS-TOKEN.
          // NebulaGPT consumes that token directly to query Graph on the
          // user's behalf — no OBO swap needed.
          loginParameters: [
            'scope=openid profile email offline_access https://graph.microsoft.com/.default'
          ]
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
    httpSettings: {
      // Standard convention = read X-Forwarded-Host / X-Forwarded-Proto so
      // Easy Auth's OAuth callback URL matches the hostname the user
      // actually requested. Required for any custom domain (otherwise the
      // callback always goes to the original Azure FQDN, the cookie ends
      // up bound to the wrong host, and downstream calls 401).
      forwardProxy: {
        convention: 'Standard'
      }
    }
  }
}

output appId string = app.id
output name string = app.name
output fqdn string = app.properties.configuration.ingress.fqdn
