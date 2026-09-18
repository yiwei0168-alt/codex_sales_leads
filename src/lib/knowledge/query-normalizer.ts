import registry from "../../../config/knowledge/attribute-registry.v1.json";

export const ATTRIBUTE_REGISTRY_VERSION=registry.version;
export type ProductComparisonCategory=keyof typeof registry.defaultComparisonProfiles;
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
export function exactModelMentions(query:string,models:readonly string[]):string[]{const normalized=normalizeKnowledgeText(query);const occupied:Array<[number,number]>=[];const found:Array<{model:string;start:number}>=[];for(const model of [...models].sort((a,b)=>b.length-a.length)){const token=normalizeKnowledgeText(model);const escaped=token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");for(const match of normalized.matchAll(new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`,`gi`))){const start=match.index,end=start+token.length;if(!occupied.some(([a,b])=>start<b&&end>a)){occupied.push([start,end]);found.push({model,start});}}}return found.sort((a,b)=>a.start-b.start).map(item=>item.model);}
export function inferComparisonCategory(storageKeys:readonly string[]):ProductComparisonCategory|undefined{const value=storageKeys.join(" ").toLowerCase();if(!value)return undefined;if(/(?:4g|5g|cpe|gpon)/.test(value))return"cpe";if(/(?:ceiling ap|desktop ap|wall-plate ap|outdoor ap|ap controller|wireless bridge)/.test(value))return"access-point";if(/mesh solution/.test(value))return"mesh";if(/switch/.test(value))return"switch";if(/router/.test(value))return"router";return"accessory";}
export function defaultComparisonAttributes(categories:readonly ProductComparisonCategory[]):string[]{return[...new Set(categories.flatMap(category=>registry.defaultComparisonProfiles[category]))];}
