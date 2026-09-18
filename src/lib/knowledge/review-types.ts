import { createHash } from "node:crypto";
import type { KnowledgeEvaluationCase } from "./evaluation/types";
import attributeRegistry from "../../../config/knowledge/attribute-registry.v1.json";

export type FactReviewDecision = "verify" | "retain-candidate" | "reject" | "correct";

export interface KnowledgeFactReviewItem {
  reviewId:string; releaseId:string; reason:string; status:string; entityKey:string;
  entityVersion:string|null; market:string|null; attributeKey:string; rawValue:string;
  typedValue:unknown; unit:string|null; polarity:string; verificationStatus:string;
  assetId:string; documentTitle:string; documentVersion:string|null; sourceSha256:string;
  sourceLocation:Record<string,unknown>; evidenceText:string; resolutionNote:string|null;
  reviewedAt:string|null; assetUrl:string;
}

export interface KnowledgeFactReviewResponse {
  items:KnowledgeFactReviewItem[]; total:number; offset:number; limit:number;
  counts:Record<string,number>;
}

export interface GoldSourceCoordinate {
  assetSha256:string; unitIndex:number; row?:number; version?:string;
}

export interface KnowledgeGoldReviewItem extends KnowledgeEvaluationCase {
  caseSha256:string; expectedAnswer:string; expectedSources:GoldSourceCoordinate[];
  reviewNote:string; reviewed:boolean; reviewedAt:string|null; revision:number;
  locked:boolean;
  sourceSuggestions:Array<{assetId:string;assetSha256:string;title:string;version:string|null;url:string}>;
}

export interface KnowledgeGoldReviewResponse {
  corpusVersion:string; items:KnowledgeGoldReviewItem[]; total:number; offset:number; limit:number;
  reviewed:number; counts:Record<string,{total:number;reviewed:number}>;
  holdoutUnlocked:boolean; retrievalProfileKey:string; retrievalProfileSha256:string;
}

export const RAG_V3_RETRIEVAL_PROFILE={
  key:"rag-v3-rrf-v1.0.0",candidateLimitPerLane:40,rrfK:60,
  weights:{facts:1.4,fulltext:1,qwen:1,bge:1.1},resultLimit:8,
} as const;

export function stableJson(value:unknown):string {
  if(Array.isArray(value))return`[${value.map(stableJson).join(",")}]`;
  if(value&&typeof value==="object")return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function evaluationCaseSha256(item:KnowledgeEvaluationCase):string {
  return createHash("sha256").update(stableJson(item)).digest("hex");
}

export function retrievalProfileSha256():string {
  return createHash("sha256").update(stableJson(RAG_V3_RETRIEVAL_PROFILE)).digest("hex");
}

export function goldSourcesRequired(item:Pick<KnowledgeEvaluationCase,"expectedOutcome">):boolean {
  return item.expectedOutcome==="route"||item.expectedOutcome==="insufficient-evidence";
}

export function correctedFactValueIsValid(attributeKey:string,value:unknown,unit:string|null|undefined):boolean {
  const attribute=attributeRegistry.attributes.find(item=>item.key===attributeKey);if(!attribute)return false;
  const expectedUnit="unit" in attribute?attribute.unit:undefined;if((expectedUnit??null)!==(unit||null))return false;
  if(attribute.type==="integer")return typeof value==="number"&&Number.isSafeInteger(value);
  if(attribute.type==="number")return typeof value==="number"&&Number.isFinite(value);
  if(attribute.type==="boolean")return typeof value==="boolean";
  if(attribute.type==="dimensions")return Array.isArray(value)&&value.length===3&&value.every(item=>typeof item==="number"&&Number.isFinite(item)||typeof item==="string"&&item.trim()!==""&&Number.isFinite(Number(item)));
  if(attribute.type.endsWith("-set"))return typeof value==="string"&&value.trim()!==""||Array.isArray(value)&&value.length>0&&value.every(item=>typeof item==="string"&&item.trim()!=="");
  return typeof value==="string"&&value.trim()!=="";
}
