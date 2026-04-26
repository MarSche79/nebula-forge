export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  portalOrigin: process.env.PORTAL_ORIGIN || "*",
  aiProjectEndpoint: process.env.AI_PROJECT_ENDPOINT!,
  openaiDeployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-4o-mini",
  azureOpenAiEndpoint: process.env.AZURE_OPENAI_ENDPOINT || "",
  entraTenantId: process.env.ENTRA_TENANT_ID!,
  entraClientId: process.env.ENTRA_CLIENT_ID!,
  authEnabled: process.env.AUTH_ENABLED !== "false",
  postgres: {
    host: process.env.PSQL_HOST || "",
    database: process.env.PSQL_DATABASE || "nebulaforge",
    user: process.env.PSQL_USER || "",
    port: parseInt(process.env.PSQL_PORT || "5432", 10),
    enabled: !!(process.env.PSQL_HOST && process.env.PSQL_USER)
  },
  mcpServers: {
    hr: process.env.MCP_HR_URL || "http://localhost:3001",
    materials: process.env.MCP_MATERIALS_URL || "http://localhost:3002",
    exploration: process.env.MCP_EXPLORATION_URL || "http://localhost:3003",
    science: process.env.MCP_SCIENCE_URL || "http://localhost:3004",
    safety: process.env.MCP_SAFETY_URL || "http://localhost:3005",
    engineering: process.env.MCP_ENGINEERING_URL || "http://localhost:3006",
    logistics: process.env.MCP_LOGISTICS_URL || "http://localhost:3007",
    comms: process.env.MCP_COMMS_URL || "http://localhost:3008",
    medbay: process.env.MCP_MEDBAY_URL || "http://localhost:3009"
  }
};

export type McpServerKey = keyof typeof config.mcpServers;
