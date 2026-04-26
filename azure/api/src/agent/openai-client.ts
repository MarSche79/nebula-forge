import { AzureOpenAI } from "openai";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import { config } from "../config.js";

let _client: AzureOpenAI | null = null;

export function getOpenAI(): AzureOpenAI {
  if (_client) return _client;
  const azureADTokenProvider = getBearerTokenProvider(
    new DefaultAzureCredential({
      managedIdentityClientId: process.env.AZURE_CLIENT_ID,
    }),
    "https://cognitiveservices.azure.com/.default",
  );
  _client = new AzureOpenAI({
    endpoint: config.azureOpenAiEndpoint,
    apiVersion: "2024-10-21",
    deployment: config.openaiDeployment,
    azureADTokenProvider,
  });
  return _client;
}
