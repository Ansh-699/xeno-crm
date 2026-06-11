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

const decls = toolDefinitions.map((t:any) => ({ name: t.name, parameters: sanitize(t.input_schema) }));
// Find any leaf where a property value isn't an object, or missing type
function walk(schema: any, path: string) {
  if (!schema || typeof schema !== "object") { console.log("NON-OBJECT SCHEMA at", path, "=>", JSON.stringify(schema)); return; }
  if (schema.properties) {
    for (const [k,v] of Object.entries<any>(schema.properties)) {
      if (typeof v !== "object") console.log("BAD PROP VALUE at", `${path}.properties.${k}`, "=>", JSON.stringify(v));
      else {
        if (!v.type && !v.enum && !v.properties) console.log("NO-TYPE LEAF at", `${path}.properties.${k}`, "=>", JSON.stringify(v));
        walk(v, `${path}.properties.${k}`);
      }
    }
  }
  if (schema.items) walk(schema.items, `${path}.items`);
}
decls.forEach((d,i) => walk(d.parameters, `${d.name}`));
console.log("\n--- enums present? ---");
decls.forEach((d:any) => { const s=JSON.stringify(d); if (s.includes('"enum"')) console.log(d.name, "has enum"); });
