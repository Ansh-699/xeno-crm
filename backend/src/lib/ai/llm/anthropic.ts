import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMMessage, LLMResponse, LLMToolDef } from "./types";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

// Cap each request so a hung provider cannot stall the agent loop / poller worker.
const REQUEST_TIMEOUT_MS = 30_000;

export function anthropicProvider(apiKey: string, model = DEFAULT_MODEL): LLMProvider {
  const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS });
  return {
    async generate({ system, messages, tools, maxTokens = 4096 }): Promise<LLMResponse> {
      const resp = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        tools: tools.map((t: LLMToolDef) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        })),
        messages: messages.map((m: LLMMessage) => ({
          role: m.role,
          content: m.content.map((b) => {
            if (b.type === "text") return { type: "text" as const, text: b.text };
            if (b.type === "tool_use") return { type: "tool_use" as const, id: b.id, name: b.name, input: b.input };
            return { type: "tool_result" as const, tool_use_id: b.toolUseId, content: b.content, is_error: b.isError };
          }),
        })) as Anthropic.MessageParam[],
      });

      let text = "";
      const toolUses: LLMResponse["toolUses"] = [];
      for (const block of resp.content) {
        if (block.type === "text") text += block.text;
        else if (block.type === "tool_use") toolUses.push({ id: block.id, name: block.name, input: block.input });
      }
      return { text, toolUses, stopReason: resp.stop_reason ?? "end_turn" };
    },
  };
}
