import { toolDefinitions } from "./src/lib/ai/tools/index";
const UNSUPPORTED_SCHEMA_KEYS = new Set(["additionalProperties","$schema","$id","definitions","patternProperties","default"]);
const ALLOWED_SCALAR_KEYS = new Set(["type","description","enum","format","required"]);
function sanitizeSchema(node: any): any {
  if (!node || typeof node !== "object") return { type: "string" };
  const out: any = {};
  for (const key of ALLOWED_SCALAR_KEYS) if (node[key] !== undefined && !UNSUPPORTED_SCHEMA_KEYS.has(key)) out[key]=node[key];
  if (node.properties && typeof node.properties === "object") {
    out.type="object"; out.properties={};
    for (const [p,s] of Object.entries(node.properties)) out.properties[p]=sanitizeSchema(s);
  }
  if (node.items) { out.type="array"; out.items=sanitizeSchema(node.items); }
  if (out.type===undefined) out.type="string";
  return out;
}
const t = (toolDefinitions as any[]).find(t=>t.name==="create_segment");
const s = sanitizeSchema(t.input_schema);
console.log(JSON.stringify(s, null, 1));
// validate: no "type" key directly inside any properties map
function check(node:any, path:string, errs:string[]) {
  if (node.properties) for (const k of Object.keys(node.properties)) {
    if (k==="type"||k==="enum"||k==="description") errs.push(`stray ${k} as property name at ${path}`);
    check(node.properties[k], `${path}.${k}`, errs);
  }
  if (node.items) check(node.items, `${path}[]`, errs);
}
const errs:string[]=[]; check(s,"root",errs);
console.log("\nVALIDATION:", errs.length? errs.join("; ") : "CLEAN");
