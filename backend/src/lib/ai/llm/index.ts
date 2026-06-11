import type { LLMCredentials, LLMProvider } from "./types";
import { anthropicProvider } from "./anthropic";
import { openaiProvider } from "./openai";
import { googleProvider } from "./google";

export * from "./types";

export function makeProvider(creds: LLMCredentials): LLMProvider {
  if (!creds?.apiKey) throw new Error("Missing LLM API key");
  switch (creds.provider) {
    case "anthropic": return anthropicProvider(creds.apiKey, creds.model);
    case "openai":    return openaiProvider(creds.apiKey, creds.model);
    case "google":    return googleProvider(creds.apiKey, creds.model);
    default: throw new Error(`Unsupported provider: ${(creds as any).provider}`);
  }
}
