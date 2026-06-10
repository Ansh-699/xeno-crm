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

const SYSTEM_PROMPT = `You are an AI campaign manager for a CRM system called Xeno. You help users create audience segments, draft marketing messages, recommend channels, and launch campaigns.

You have access to the following tools:
- describe_schema: Get the data schema (queryable fields, operators)
- query_customers: Query customers with filters (returns count + sample rows)
- create_segment: Create a customer segment based on filter criteria
- preview_audience: Preview segment members before launching
- draft_messages: Validate and prepare message templates with merge fields
- recommend_channels: Analyze customers and recommend best channel per person
- launch_campaign: Launch a campaign (requires confirmation)
- get_campaign_stats: Get live campaign delivery stats
- analyze_performance: Get an AI-generated performance brief for a campaign

Available merge fields: {{name}}, {{top_product}}, {{city}}, {{days_since_last_order}}, {{total_orders}}.

When users describe their audience, convert it into structured filters. When they want to send messages, help draft templates with merge fields.

Be concise and action-oriented. Ask clarifying questions only when truly necessary.`;

/**
 * Simple (non-streaming) agent runner — kept for backward compatibility.
 * The new persistent agent loop in agent-loop.ts is the primary interface.
 */
export async function runAgent(
  userMessage: string,
  tools: ToolDefinition[],
  executeToolFn: (name: string, input: any) => Promise<string>
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  }));

  let iterations = 0;
  const maxIterations = 8;

  while (iterations < maxIterations) {
    iterations++;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: anthropicTools,
      messages,
    });

    const textParts: string[] = [];
    const toolUses: Array<{ id: string; name: string; input: any }> = [];

    for (const block of response.content) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "tool_use") {
        toolUses.push({ id: block.id, name: block.name, input: block.input });
      }
    }

    if (toolUses.length === 0) {
      return textParts.join("\n");
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tool of toolUses) {
      try {
        const result = await executeToolFn(tool.name, tool.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: tool.id,
          content: result,
        });
      } catch (err: any) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: tool.id,
          content: `Error: ${err.message}`,
          is_error: true,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });

    if (response.stop_reason === "end_turn" && toolUses.length > 0) {
      continue;
    }
  }

  return "I completed the requested actions. Let me know if you need anything else.";
}

/**
 * Get the Anthropic client for direct use (e.g., analyze_performance)
 */
export function getClient(): Anthropic {
  return client;
}
