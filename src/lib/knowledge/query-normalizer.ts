import registry from "../../../config/knowledge/attribute-registry.v1.json";

export const ATTRIBUTE_REGISTRY_VERSION=registry.version;
export function normalizeKnowledgeText(value:string):string{return value.normalize("NFKC").replace(/[×✕]/g,"x").replace(/\s+/g," ").trim().toLowerCase();}
export function resolveAttributeCandidates(query:string):string[]{const normalized=normalizeKnowledgeText(query);return registry.attributes.filter(attribute=>attribute.aliases.some(alias=>normalized.includes(normalizeKnowledgeText(alias)))).map(attribute=>attribute.key);}
export function buildControlledLexicalQuery(query:string):string{
  const attributes=registry.attributes.filter(attribute=>attribute.aliases.some(alias=>normalizeKnowledgeText(query).includes(normalizeKnowledgeText(alias))));
  if(!attributes.length)return query;
  const candidates=[...new Set(attributes.flatMap(attribute=>attribute.aliases).map(alias=>alias.replace(/["\\]/g," ").trim()).filter(Boolean))];
  const modelTokens=[...query.matchAll(/(?<![\p{L}\p{N}])(?=[A-Za-z0-9-]{3,32}(?![\p{L}\p{N}]))(?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]+/gu)].map(match=>match[0]);
  const attributeGroup=candidates.map(value=>`"${value}"`).join(" OR ");
  return `${modelTokens.map(value=>`"${value}"`).join(" ")} (${attributeGroup})`.trim();
}
export function exactModelMentions(query:string,models:readonly string[]):string[]{const normalized=normalizeKnowledgeText(query);const occupied:Array<[number,number]>=[];const found:string[]=[];for(const model of [...models].sort((a,b)=>b.length-a.length)){const token=normalizeKnowledgeText(model);const escaped=token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");for(const match of normalized.matchAll(new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`,`gi`))){const start=match.index,end=start+token.length;if(!occupied.some(([a,b])=>start<b&&end>a)){occupied.push([start,end]);found.push(model);}}}return found;}
