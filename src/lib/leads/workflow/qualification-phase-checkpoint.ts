import {z} from "zod";
import {isDeepStrictEqual} from "node:util";

import {tenantQuery} from "@/lib/rag/db";
import type {StructuredAiRequest,StructuredAiResponse} from "@/providers/contracts";

import {qualificationPhaseOutputSchema,validateQualificationPhaseOutput,
  type QualificationPhaseOutput} from "./qualification-phase-output";

export interface QualificationPhaseCheckpointScope {
  userId:string;workspaceId:string;actionId:string;countryCode:string;expectedProviderId:string;
}
const responseSchema=z.strictObject({
  output:qualificationPhaseOutputSchema,
  modelVersion:z.string().min(1),promptVersion:z.string().min(1),latencyMs:z.number().min(0),
  warnings:z.array(z.string()),requestedModelVersion:z.string().optional(),
  actualProviderId:z.string().optional(),attempts:z.number().int().nonnegative().optional(),
  retries:z.number().int().nonnegative().optional(),usage:z.strictObject({
    promptTokens:z.number().int().nonnegative(),completionTokens:z.number().int().nonnegative(),
    reasoningTokens:z.number().int().nonnegative(),totalTokens:z.number().int().nonnegative(),
    cachedPromptTokens:z.number().int().nonnegative().optional(),
    accountCashCostUsd:z.number().nonnegative().optional(),
  }).optional(),
});
type SavedPhaseResponse=z.infer<typeof responseSchema>;
function identity(scope:QualificationPhaseCheckpointScope,request:StructuredAiRequest<unknown>,contract:string){
  const input=request.input as {sourceFingerprint?:unknown;phaseIndex?:unknown;
    market?:{countryCode?:unknown};candidate?:{candidateId?:unknown}}|null;
  const sourceFingerprint=input?.sourceFingerprint,phaseIndex=input?.phaseIndex;
  const candidateId=input?.candidate?.candidateId;
  if(!/^[a-f0-9-]{36}$/.test(scope.userId)||!/^[a-f0-9-]{36}$/.test(scope.workspaceId)
    ||!/^[a-f0-9-]{36}$/.test(scope.actionId)||!/^[A-Z]{2}$/.test(scope.countryCode)
    ||!scope.expectedProviderId||request.task!=="lead-qualification"
    ||input?.market?.countryCode!==scope.countryCode
    ||typeof candidateId!=="string"||!candidateId.trim()
    ||typeof sourceFingerprint!=="string"||!/^[a-f0-9]{64}$/.test(sourceFingerprint)
    ||typeof phaseIndex!=="number"||!Number.isSafeInteger(phaseIndex)||phaseIndex<0
    ||!/^[a-f0-9]{64}$/.test(contract))throw new Error("Invalid qualification phase checkpoint identity");
  return {sourceFingerprint,phaseIndex,candidateId};
}
function safeResponse(scope:QualificationPhaseCheckpointScope,request:StructuredAiRequest<unknown>,
  response:StructuredAiResponse<unknown>):SavedPhaseResponse{
  if(response.modelVersion!==request.modelVersion||response.promptVersion!==request.promptVersion
    ||(response.requestedModelVersion&&response.requestedModelVersion!==request.modelVersion)
    ||response.actualProviderId!==scope.expectedProviderId)
    throw new Error("Qualification phase actual route differs from the reusable request contract");
  const parsed=responseSchema.parse({output:validateQualificationPhaseOutput(request,response.output),
    modelVersion:response.modelVersion,promptVersion:response.promptVersion,latencyMs:response.latencyMs,
    warnings:response.warnings,requestedModelVersion:response.requestedModelVersion,
    actualProviderId:response.actualProviderId,attempts:response.attempts,retries:response.retries,
    usage:response.usage});
  return JSON.parse(JSON.stringify(parsed)) as SavedPhaseResponse;
}

/** Completed only. A miss never grants permission to replay an unknown paid request. */
export function productQualificationPhaseCheckpoint(scope:QualificationPhaseCheckpointScope){
  return {
    async load(request:StructuredAiRequest<unknown>,contract:string,
      paidFingerprint:string):Promise<StructuredAiResponse<QualificationPhaseOutput>|null>{
      const id=identity(scope,request,contract);
      if(!/^[a-f0-9]{64}$/.test(paidFingerprint))throw new Error("Invalid qualification phase paid replay identity");
      const rows=await tenantQuery<{response:unknown}>(scope.userId,
        `select response from lead_qualification_phase_checkpoint where user_id=$1 and workspace_id=$2
          and action_id=$3 and country_code=$4 and candidate_id=$5 and source_fingerprint=$6
          and phase_index=$7 and execution_contract=$8 and paid_request_fingerprint=$9`,
        [scope.userId,scope.workspaceId,scope.actionId,scope.countryCode,id.candidateId,
          id.sourceFingerprint,id.phaseIndex,contract,paidFingerprint]);
      if(!rows[0])return null;
      const parsed=responseSchema.parse(rows[0].response);
      return safeResponse(scope,request,parsed);
    },
    async save(request:StructuredAiRequest<unknown>,contract:string,paidFingerprint:string,
      response:StructuredAiResponse<unknown>):Promise<void>{
      const id=identity(scope,request,contract);
      if(!/^[a-f0-9]{64}$/.test(paidFingerprint))throw new Error("Invalid qualification phase paid replay identity");
      const safe=safeResponse(scope,request,response);
      await tenantQuery(scope.userId,
        `insert into lead_qualification_phase_checkpoint(user_id,workspace_id,action_id,country_code,
          candidate_id,source_fingerprint,phase_index,execution_contract,paid_request_fingerprint,response)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) on conflict do nothing`,
        [scope.userId,scope.workspaceId,scope.actionId,scope.countryCode,id.candidateId,
          id.sourceFingerprint,id.phaseIndex,contract,paidFingerprint,JSON.stringify(safe)]);
      const stored=await this.load(request,contract,paidFingerprint);
      if(!isDeepStrictEqual(stored,safe))throw new Error("Qualification phase checkpoint conflict");
    },
  };
}
