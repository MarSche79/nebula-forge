@description('Azure region')
param location string

@description('Resource tags')
param tags object

@description('Postgres Flexible Server name (must be globally unique).')
param serverName string

@description('Database name to create on the server.')
param databaseName string = 'nebulaforge'

@description('AAD Object ID of the developer/admin who will own the schema. Required.')
param adminPrincipalId string

@description('UPN / display name of the AAD admin (shown in the portal). Required.')
param adminPrincipalName string

@description('AAD principal type for the admin (User by default).')
@allowed([ 'User', 'Group', 'ServicePrincipal' ])
param adminPrincipalType string = 'User'

@description('Tenant ID for AAD auth.')
param tenantId string

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: serverName
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
    authConfig: {
      activeDirectoryAuth: 'Enabled'
      // No SQL admin login — AAD-only. CAE has no VNet, so we have to keep
      // public network access on; the firewall rule below allows Azure
      // services + we rely on AAD-only for AuthZ.
      passwordAuth: 'Disabled'
      tenantId: tenantId
    }
  }
}

// AAD admin assignment is intentionally NOT in bicep. The
// `Microsoft.DBforPostgreSQL/.../administrators` sub-resource consistently
// races the server's data plane during a `azd provision`, returning
// `AadAuthOperationCannotBePerformedWhenServerIsNotAccessible`. Instead we
// assign it imperatively (with retry) from `infra/postgres-bootstrap.ps1`,
// which runs once per environment.

resource db 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Allow Azure services (covers Container Apps egress IPs, since the CAE has no VNet).
resource fwAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: server
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

output serverFqdn string = server.properties.fullyQualifiedDomainName
output serverName string = server.name
output databaseName string = databaseName
