import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, any>;
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
}

export interface StreamEvent {
  type: "text" | "tool_use" | "tool_result" | "end";
  text?: string;
  toolUse?: { id: string; name: string; input: any };
}

/**
 * Get the Anthropic client for direct use (e.g., analyze_performance)
 */
export function getClient(): Anthropic {
  return client;
}
