import { toolDefinitions } from "./src/lib/ai/tools/index";
const UNSUPPORTED = new Set(["additionalProperties","$schema","$id","definitions","patternProperties","default"]);
function sanitize(node: any): any {
  if (Array.isArray(node)) return node.map(sanitize);
  if (node && typeof node === "object") {
    const out: any = {};
    for (const [k,v] of Object.entries(node)) { if (UNSUPPORTED.has(k)) continue; out[k]=sanitize(v); }
    if (out.properties===undefined && out.type===undefined && out.enum===undefined) out.type="string";
    return out;
  }
  return node;
}
const t = (toolDefinitions as any[]).find(t=>t.name==="create_segment");
console.log(JSON.stringify(sanitize(t.input_schema), null, 1));
