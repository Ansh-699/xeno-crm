import OpenAI from "openai";
import type { LLMProvider, LLMMessage, LLMResponse } from "./types";

const DEFAULT_MODEL = "gpt-4o";

export function openaiProvider(apiKey: string, model = DEFAULT_MODEL): LLMProvider {
  const client = new OpenAI({ apiKey });
  return {
    async generate({ system, messages, tools, maxTokens = 4096 }): Promise<LLMResponse> {
      const oa: any[] = [{ role: "system", content: system }];

      for (const m of messages) {
        if (m.role === "assistant") {
          const textBlocks = m.content.filter((b) => b.type === "text") as any[];
          const toolUseBlocks = m.content.filter((b) => b.type === "tool_use") as any[];
          oa.push({
            role: "assistant",
            content: textBlocks.map((b) => b.text).join("") || null,
            tool_calls: toolUseBlocks.length
              ? toolUseBlocks.map((b) => ({
                  id: b.id,
                  type: "function",
                  function: { name: b.name, arguments: JSON.stringify(b.input) },
                }))
              : undefined,
          });
        } else {
          const toolResults = m.content.filter((b) => b.type === "tool_result") as any[];
          const textBlocks = m.content.filter((b) => b.type === "text") as any[];
          for (const tr of toolResults) {
            oa.push({ role: "tool", tool_call_id: tr.toolUseId, content: tr.content });
          }
          if (textBlocks.length) {
            oa.push({ role: "user", content: textBlocks.map((b) => b.text).join("") });
          }
        }
      }

      const resp = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: oa,
        ...(tools.length > 0 && {
          tools: tools.map((t) => ({
            type: "function" as const,
            function: { name: t.name, description: t.description, parameters: t.inputSchema },
          })),
        }),
      });

      const choice = resp.choices?.[0];
      if (!choice) {
        // Empty choices (e.g. content filter / API edge) — return an empty turn rather
        // than throwing a TypeError on choices[0].
        return { text: "", toolUses: [], stopReason: "stop" };
      }
      const msg = choice.message;
      const toolUses = (msg.tool_calls ?? []).map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || "{}"),
      }));
      return { text: msg.content ?? "", toolUses, stopReason: choice.finish_reason ?? "stop" };
    },
  };
}
