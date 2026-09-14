import {isDeepStrictEqual} from "node:util";
import {z} from "zod";

import {tenantQuery} from "@/lib/rag/db";
import type {StructuredAiRequest,StructuredAiResponse} from "@/providers/contracts";
import type {QualificationPhaseCheckpointScope} from "./qualification-phase-checkpoint";

const responseSchema=z.strictObject({
  output:z.unknown(),modelVersion:z.string().min(1),promptVersion:z.string().min(1),
  latencyMs:z.number().min(0),warnings:z.array(z.string()),
  providerRequestId:z.string().optional(),requestedModelVersion:z.string().optional(),
  actualProviderId:z.string().optional(),
  attempts:z.number().int().nonnegative().optional(),retries:z.number().int().nonnegative().optional(),
  usage:z.strictObject({promptTokens:z.number().int().nonnegative(),
    completionTokens:z.number().int().nonnegative(),reasoningTokens:z.number().int().nonnegative(),
    totalTokens:z.number().int().nonnegative(),cachedPromptTokens:z.number().int().nonnegative().optional(),
    accountCashCostUsd:z.number().nonnegative().optional()}).optional(),
});
function identity(scope:QualificationPhaseCheckpointScope,request:StructuredAiRequest<unknown>,
  contract:string,paidFingerprint:string){
  const input=request.input as {market?:{countryCode?:unknown};phaseScreening?:{sourceFingerprint?:unknown};
    candidates?:Array<{candidateId?:unknown}>}|null;
  const candidateId=input?.candidates?.[0]?.candidateId;
  const sourceFingerprint=input?.phaseScreening?.sourceFingerprint;
  if(!/^[a-f0-9-]{36}$/.test(scope.userId)||!/^[a-f0-9-]{36}$/.test(scope.workspaceId)
    ||!/^[a-f0-9-]{36}$/.test(scope.actionId)||!/^[A-Z]{2}$/.test(scope.countryCode)
    ||!scope.expectedProviderId||request.task!=="lead-qualification"
    ||input?.market?.countryCode!==scope.countryCode||input?.candidates?.length!==1
    ||typeof candidateId!=="string"||!candidateId.trim()
    ||typeof sourceFingerprint!=="string"||!/^[a-f0-9]{64}$/.test(sourceFingerprint)
    ||!/^[a-f0-9]{64}$/.test(contract)||!/^[a-f0-9]{64}$/.test(paidFingerprint))
    throw new Error("Invalid qualification final checkpoint identity");
  return {candidateId,sourceFingerprint};
}
function safeResponse(scope:QualificationPhaseCheckpointScope,request:StructuredAiRequest<unknown>,
  response:StructuredAiResponse<unknown>):StructuredAiResponse<unknown>{
  if(response.modelVersion!==request.modelVersion||response.promptVersion!==request.promptVersion
    ||(response.requestedModelVersion&&response.requestedModelVersion!==request.modelVersion)
    ||response.actualProviderId!==scope.expectedProviderId)
    throw new Error("Qualification final actual route differs from the reusable request contract");
  const parsed=responseSchema.parse(response);
  if(!Object.hasOwn(parsed,"output")||parsed.output===undefined)
    throw new Error("Qualification final response has no structured output");
  const serialized=JSON.stringify(parsed);
  if(!serialized)throw new Error("Qualification final response could not be serialized");
  return JSON.parse(serialized) as StructuredAiResponse<unknown>;
}

/** Durable parsed provider response; business-invalid output is retained and never bought again automatically. */
export function productQualificationFinalCheckpoint(scope:QualificationPhaseCheckpointScope){
  return {
    async load(request:StructuredAiRequest<unknown>,contract:string,
      paidFingerprint:string):Promise<StructuredAiResponse<unknown>|null>{
      const id=identity(scope,request,contract,paidFingerprint);
      const rows=await tenantQuery<{response:unknown}>(scope.userId,
        `select response from lead_qualification_final_checkpoint where user_id=$1 and workspace_id=$2
          and action_id=$3 and country_code=$4 and candidate_id=$5 and source_fingerprint=$6
          and execution_contract=$7 and paid_request_fingerprint=$8`,
        [scope.userId,scope.workspaceId,scope.actionId,scope.countryCode,id.candidateId,
          id.sourceFingerprint,contract,paidFingerprint]);
      if(!rows[0])return null;
      return safeResponse(scope,request,responseSchema.parse(rows[0].response));
    },
    async save(request:StructuredAiRequest<unknown>,contract:string,paidFingerprint:string,
      response:StructuredAiResponse<unknown>):Promise<void>{
      const id=identity(scope,request,contract,paidFingerprint);
      const safe=safeResponse(scope,request,response);
      await tenantQuery(scope.userId,
        `insert into lead_qualification_final_checkpoint(user_id,workspace_id,action_id,country_code,
          candidate_id,source_fingerprint,execution_contract,paid_request_fingerprint,response)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) on conflict do nothing`,
        [scope.userId,scope.workspaceId,scope.actionId,scope.countryCode,id.candidateId,
          id.sourceFingerprint,contract,paidFingerprint,JSON.stringify(safe)]);
      const stored=await this.load(request,contract,paidFingerprint);
      if(!isDeepStrictEqual(stored,safe))throw new Error("Qualification final checkpoint conflict");
    },
  };
}
