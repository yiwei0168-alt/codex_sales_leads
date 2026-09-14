import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {z} from "zod";

import {tenantQuery} from "@/lib/rag/db";
import type {StructuredAiRequest,StructuredAiResponse} from "@/providers/contracts";

import {QUALIFICATION_SINGLETON_CHUNK_VERSION,qualificationSingletonChunkOutputSchema,
  validateQualificationSingletonChunkOutput,type QualificationSingletonChunkOutput} from "./qualification-singleton-chunks";
import type {QualificationPhaseCheckpointScope} from "./qualification-phase-checkpoint";

const responseSchema=z.strictObject({
  output:qualificationSingletonChunkOutputSchema,
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
type SavedChunkResponse=z.infer<typeof responseSchema>;

function identity(scope:QualificationPhaseCheckpointScope,request:StructuredAiRequest<unknown>,contract:string){
  const input=request.input as {candidateId?:unknown;sourceFingerprint?:unknown;
    candidateSourceFingerprint?:unknown;unitKind?:unknown;unitId?:unknown;
    contentSha256?:unknown;chunkIndex?:unknown;market?:{countryCode?:unknown}}|null;
  if(!/^[a-f0-9-]{36}$/.test(scope.userId)||!/^[a-f0-9-]{36}$/.test(scope.workspaceId)
    ||!/^[a-f0-9-]{36}$/.test(scope.actionId)||!/^[A-Z]{2}$/.test(scope.countryCode)
    ||!scope.expectedProviderId||request.task!=="lead-qualification"
    ||request.promptVersion!==QUALIFICATION_SINGLETON_CHUNK_VERSION
    ||input?.market?.countryCode!==scope.countryCode
    ||typeof input?.candidateId!=="string"||!input.candidateId.trim()
    ||typeof input?.sourceFingerprint!=="string"||!/^[a-f0-9]{64}$/.test(input.sourceFingerprint)
    ||typeof input?.candidateSourceFingerprint!=="string"
    ||!/^[a-f0-9]{64}$/.test(input.candidateSourceFingerprint)
    ||typeof input?.unitId!=="string"||!input.unitId.trim()
    ||!(["finding","evidence"] as unknown[]).includes(input?.unitKind)
    ||typeof input?.contentSha256!=="string"||!/^[a-f0-9]{64}$/.test(input.contentSha256)
    ||typeof input?.chunkIndex!=="number"||!Number.isSafeInteger(input.chunkIndex)
    ||input.chunkIndex<0||input.chunkIndex>2_147_483_647
    ||(request.dataClassification==="private-workspace"&&request.tenantScope!==scope.workspaceId)
    ||!/^[a-f0-9]{64}$/.test(contract))throw new Error("Invalid singleton chunk checkpoint identity");
  const expected=createHash("sha256").update(JSON.stringify({version:QUALIFICATION_SINGLETON_CHUNK_VERSION,
    candidateSourceFingerprint:input.candidateSourceFingerprint,unitKind:input.unitKind,
    unitId:input.unitId,contentSha256:input.contentSha256})).digest("hex");
  if(input.sourceFingerprint!==expected)throw new Error("Singleton chunk checkpoint source differs");
  return {candidateId:input.candidateId,sourceFingerprint:input.sourceFingerprint,chunkIndex:input.chunkIndex};
}

function safeResponse(scope:QualificationPhaseCheckpointScope,request:StructuredAiRequest<unknown>,
  response:StructuredAiResponse<unknown>):SavedChunkResponse{
  const requestedModel=scope.requestedModelVersion??request.modelVersion;
  if(response.modelVersion!==request.modelVersion||response.promptVersion!==request.promptVersion
    ||(response.requestedModelVersion&&response.requestedModelVersion!==requestedModel)
    ||(requestedModel!==request.modelVersion&&response.requestedModelVersion!==requestedModel)
    ||response.actualProviderId!==scope.expectedProviderId)
    throw new Error("Singleton chunk actual route differs from the reusable request contract");
  const parsed=responseSchema.parse({output:validateQualificationSingletonChunkOutput(request,response.output),
    modelVersion:response.modelVersion,promptVersion:response.promptVersion,latencyMs:response.latencyMs,
    warnings:response.warnings,requestedModelVersion:response.requestedModelVersion,
    actualProviderId:response.actualProviderId,attempts:response.attempts,retries:response.retries,
    usage:response.usage});
  return JSON.parse(JSON.stringify(parsed)) as SavedChunkResponse;
}

/** Uses the existing append-only tenant-scoped phase table under a disjoint stream fingerprint. */
export function productQualificationSingletonChunkCheckpoint(scope:QualificationPhaseCheckpointScope){
  return {
    async assertNoOtherCompleted(request:StructuredAiRequest<unknown>,
      allowed:Array<{contract:string;paidFingerprint:string}>):Promise<void>{
      if(!allowed.length)throw new Error("Singleton chunk has no approved completed route");
      const id=identity(scope,request,allowed[0].contract);
      const rows=await tenantQuery<{execution_contract:string;paid_request_fingerprint:string}>(scope.userId,
        `select execution_contract,paid_request_fingerprint from lead_qualification_phase_checkpoint
          where user_id=$1 and workspace_id=$2 and action_id=$3 and country_code=$4
            and candidate_id=$5 and source_fingerprint=$6 and phase_index=$7
            and coalesce(response->>'requestedModelVersion',response->>'modelVersion')=$8`,
        [scope.userId,scope.workspaceId,scope.actionId,scope.countryCode,id.candidateId,
          id.sourceFingerprint,id.chunkIndex,scope.requestedModelVersion??request.modelVersion]);
      if(rows.length)throw new Error(rows.some(row=>!allowed.some(route=>
        route.contract===row.execution_contract&&route.paidFingerprint===row.paid_request_fingerprint))
        ?"Prior singleton chunk route changed; paid work requires manual recovery"
        :"Singleton chunk completed concurrently; reload before any paid work");
    },
    async load(request:StructuredAiRequest<unknown>,contract:string,
      paidFingerprint:string):Promise<StructuredAiResponse<QualificationSingletonChunkOutput>|null>{
      const id=identity(scope,request,contract);
      if(!/^[a-f0-9]{64}$/.test(paidFingerprint))throw new Error("Invalid singleton chunk paid replay identity");
      const rows=await tenantQuery<{response:unknown}>(scope.userId,
        `select response from lead_qualification_phase_checkpoint where user_id=$1 and workspace_id=$2
          and action_id=$3 and country_code=$4 and candidate_id=$5 and source_fingerprint=$6
          and phase_index=$7 and execution_contract=$8 and paid_request_fingerprint=$9`,
        [scope.userId,scope.workspaceId,scope.actionId,scope.countryCode,id.candidateId,
          id.sourceFingerprint,id.chunkIndex,contract,paidFingerprint]);
      if(!rows[0])return null;
      const parsed=responseSchema.parse(rows[0].response);
      return safeResponse(scope,request,parsed);
    },
    async save(request:StructuredAiRequest<unknown>,contract:string,paidFingerprint:string,
      response:StructuredAiResponse<unknown>):Promise<void>{
      const id=identity(scope,request,contract);
      if(!/^[a-f0-9]{64}$/.test(paidFingerprint))throw new Error("Invalid singleton chunk paid replay identity");
      const safe=safeResponse(scope,request,response);
      await tenantQuery(scope.userId,
        `insert into lead_qualification_phase_checkpoint(user_id,workspace_id,action_id,country_code,
          candidate_id,source_fingerprint,phase_index,execution_contract,paid_request_fingerprint,response)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) on conflict do nothing`,
        [scope.userId,scope.workspaceId,scope.actionId,scope.countryCode,id.candidateId,
          id.sourceFingerprint,id.chunkIndex,contract,paidFingerprint,JSON.stringify(safe)]);
      const stored=await this.load(request,contract,paidFingerprint);
      if(!isDeepStrictEqual(stored,safe))throw new Error("Singleton chunk checkpoint conflict");
    },
  };
}
