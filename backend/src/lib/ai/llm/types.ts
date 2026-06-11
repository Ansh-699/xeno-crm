export type LLMProviderName = "anthropic" | "openai" | "google";

export type LLMRole = "user" | "assistant";

export type LLMContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: any }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export interface LLMMessage {
  role: LLMRole;
  content: LLMContentBlock[];
}

export interface LLMToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface LLMResponse {
  text: string;
  toolUses: Array<{ id: string; name: string; input: any }>;
  stopReason: string;
}

export interface LLMCredentials {
  provider: LLMProviderName;
  apiKey: string;
  model?: string;
}

export interface LLMProvider {
  generate(opts: {
    system: string;
    messages: LLMMessage[];
    tools: LLMToolDef[];
    maxTokens?: number;
  }): Promise<LLMResponse>;
}
