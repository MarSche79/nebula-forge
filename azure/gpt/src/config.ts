export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  portalOrigin: process.env.PORTAL_ORIGIN || "*",
  proxySharedSecret: process.env.PROXY_SHARED_SECRET || "",

  // Tenant lock
  allowedTenantId: process.env.ALLOWED_TENANT_ID || "",

  // Entra (Easy Auth on portal; verified here via JWKS) + OBO flow
  entraTenantId: process.env.ENTRA_TENANT_ID || "",
  entraClientId: process.env.ENTRA_CLIENT_ID || "",
  // Dedicated NebulaGPT app reg (the Easy Auth one acts on user's behalf)
  gptAppClientId: process.env.GPT_APP_CLIENT_ID || "",
  gptAppClientSecret: process.env.GPT_APP_CLIENT_SECRET || "",

  // Azure OpenAI
  openaiEndpoint: process.env.AZURE_OPENAI_ENDPOINT || "",
  openaiDeployment: process.env.AZURE_OPENAI_DEPLOYMENT_4O || process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-4o-mini",
  openaiApiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-10-21",

  // WorkIQ MCP
  workiqEnabled: (process.env.WORKIQ_ENABLED ?? "true") !== "false",
  workiqCommand: process.env.WORKIQ_COMMAND || "workiq",
  workiqArgs: (process.env.WORKIQ_ARGS || "mcp").split(/\s+/).filter(Boolean),

  // SharePoint Uploads library + save-doc flow
  sharepointSiteUrl: process.env.SHAREPOINT_SITE_URL || "",
  uploadsLibrary: process.env.UPLOADS_LIBRARY || "NebulaGPT-Uploads",
  saveDocWebhook: process.env.PA_SAVE_DOC_WEBHOOK || "",

  postgres: {
    host: process.env.PSQL_HOST || "",
    database: process.env.PSQL_DATABASE || "nebulaforge",
    user: process.env.PSQL_USER || "",
    port: parseInt(process.env.PSQL_PORT || "5432", 10),
    enabled: !!(process.env.PSQL_HOST && process.env.PSQL_USER),
  },
};
