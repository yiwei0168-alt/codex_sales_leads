import registry from "../../../config/knowledge/attribute-registry.v1.json";

export const ATTRIBUTE_REGISTRY_VERSION=registry.version;
export function normalizeKnowledgeText(value:string):string{return value.normalize("NFKC").replace(/[×✕]/g,"x").replace(/\s+/g," ").trim().toLowerCase();}
export function resolveAttributeCandidates(query:string):string[]{const normalized=normalizeKnowledgeText(query);return registry.attributes.filter(attribute=>attribute.aliases.some(alias=>normalized.includes(normalizeKnowledgeText(alias)))).map(attribute=>attribute.key);}
export function exactModelMentions(query:string,models:readonly string[]):string[]{const normalized=normalizeKnowledgeText(query);const occupied:Array<[number,number]>=[];const found:string[]=[];for(const model of [...models].sort((a,b)=>b.length-a.length)){const token=normalizeKnowledgeText(model);const escaped=token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");for(const match of normalized.matchAll(new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`,`gi`))){const start=match.index,end=start+token.length;if(!occupied.some(([a,b])=>start<b&&end>a)){occupied.push([start,end]);found.push(model);}}}return found;}
