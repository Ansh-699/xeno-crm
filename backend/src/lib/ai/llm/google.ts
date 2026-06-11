import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMProvider, LLMMessage, LLMResponse } from "./types";

const DEFAULT_MODEL = "gemini-1.5-pro";

export function googleProvider(apiKey: string, modelName = DEFAULT_MODEL): LLMProvider {
  const genAI = new GoogleGenerativeAI(apiKey);
  return {
    async generate({ system, messages, tools }): Promise<LLMResponse> {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: system,
        tools: [
          {
            functionDeclarations: tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.inputSchema as any,
            })),
          },
        ],
      });

      const contents = messages.map((m: LLMMessage) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: m.content.map((b) => {
          if (b.type === "text") return { text: b.text };
          if (b.type === "tool_use") return { functionCall: { name: b.name, args: b.input } };
          // tool_result: key by function name (Gemini has no tool_call_id concept)
          return { functionResponse: { name: b.toolUseId, response: { content: b.content } } };
        }),
      }));

      const result = await model.generateContent({ contents } as any);
      const cand = result.response.candidates?.[0];
      let text = "";
      const toolUses: LLMResponse["toolUses"] = [];

      for (const part of (cand?.content?.parts ?? []) as any[]) {
        if (part.text) text += part.text;
        if (part.functionCall) {
          // Gemini doesn't return a tool-call ID; synthesize one from name+index
          toolUses.push({
            id: `${part.functionCall.name}-${toolUses.length}`,
            name: part.functionCall.name,
            input: part.functionCall.args,
          });
        }
      }

      return { text, toolUses, stopReason: cand?.finishReason ?? "STOP" };
    },
  };
}
