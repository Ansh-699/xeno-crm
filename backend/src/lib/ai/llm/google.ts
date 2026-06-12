import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMProvider, LLMMessage, LLMResponse } from "./types";

const DEFAULT_MODEL = "gemini-2.5-flash";

// Gemini's function-calling schema is a strict OpenAPI subset. It rejects JSON-Schema
// keywords like `additionalProperties`, `$schema`, etc. Strip them recursively so the
// same tool definitions work across Anthropic/OpenAI (which accept them) and Gemini.
const UNSUPPORTED_SCHEMA_KEYS = new Set([
  "additionalProperties",
  "$schema",
  "$id",
  "definitions",
  "patternProperties",
  "default",
]);

// Schema-aware sanitizer. A JSON-Schema node is reduced to the OpenAPI subset Gemini
// accepts: copy scalar keywords, recurse only into `properties` values and `items`
// (never into the `properties` map container itself), and backfill a permissive type
// so untyped slots don't 400 the request.
const ALLOWED_SCALAR_KEYS = new Set(["type", "description", "enum", "format", "required"]);

function sanitizeSchema(node: any): any {
  if (!node || typeof node !== "object") return { type: "string" };

  const out: any = {};

  for (const key of ALLOWED_SCALAR_KEYS) {
    if (node[key] !== undefined && !UNSUPPORTED_SCHEMA_KEYS.has(key)) {
      out[key] = node[key];
    }
  }

  if (node.properties && typeof node.properties === "object") {
    out.type = "object";
    out.properties = {};
    for (const [propName, propSchema] of Object.entries(node.properties)) {
      out.properties[propName] = sanitizeSchema(propSchema);
    }
  }

  if (node.items) {
    out.type = "array";
    out.items = sanitizeSchema(node.items);
  }

  // Gemini requires every node to declare a type.
  if (out.type === undefined) out.type = "string";

  return out;
}

export function googleProvider(apiKey: string, modelName = DEFAULT_MODEL): LLMProvider {
  const genAI = new GoogleGenerativeAI(apiKey);
  return {
    async generate({ system, messages, tools }): Promise<LLMResponse> {
      const modelConfig: any = { model: modelName, systemInstruction: system };
      if (tools.length > 0) {
        modelConfig.tools = [
          {
            functionDeclarations: tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: sanitizeSchema(t.inputSchema) as any,
            })),
          },
        ];
      }
      const model = genAI.getGenerativeModel(modelConfig);

      // Map toolUseId → function name from prior assistant tool_use blocks so tool_result
      // blocks can be correlated by their real name rather than relying on the synthetic
      // "name-N" id format (which breaks for ids minted by other providers).
      const toolNameById = new Map<string, string>();
      for (const m of messages) {
        for (const b of m.content as any[]) {
          if (b.type === "tool_use" && b.id) toolNameById.set(b.id, b.name);
        }
      }

      const contents = messages.map((m: LLMMessage) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: m.content.map((b) => {
          if (b.type === "text") return { text: b.text };
          if (b.type === "tool_use") return { functionCall: { name: b.name, args: b.input } };
          // tool_result: Gemini requires the function name (not a synthetic call ID).
          // Prefer the mapped name; fall back to stripping a trailing "-N" suffix.
          const fnName = toolNameById.get(b.toolUseId) ?? b.toolUseId.replace(/-\d+$/, "");
          return { functionResponse: { name: fnName, response: { content: b.content } } };
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
