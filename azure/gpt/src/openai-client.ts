import { AzureOpenAI } from "openai";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import { config } from "./config.js";

let _client: AzureOpenAI | null = null;

export function getOpenAI(): AzureOpenAI {
  if (_client) return _client;
  if (!config.openaiEndpoint) throw new Error("AZURE_OPENAI_ENDPOINT not set");
  const cred = new DefaultAzureCredential({ managedIdentityClientId: process.env.AZURE_CLIENT_ID });
  const tokenProvider = getBearerTokenProvider(cred, "https://cognitiveservices.azure.com/.default");
  _client = new AzureOpenAI({
    endpoint: config.openaiEndpoint,
    apiVersion: config.openaiApiVersion,
    azureADTokenProvider: tokenProvider,
  });
  return _client;
}
