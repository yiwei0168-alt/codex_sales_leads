import {createHash} from 'node:crypto';
import {z} from 'zod';
import {tenantQuery} from '@/lib/rag/db';
import {getOpenRouterConfig} from '@/providers/openrouter';
import {matchesBatchModel} from '@/providers/openrouter-batch';
import {modelRoutedTransport} from '@/lib/network/model-transport';
import {incompleteStreamReceiptSchema} from '@/lib/assistant/main/model-stream-receipt';
import {reportedDollarsToMicros} from './openrouter-cost-report';
import {recordVerifiedCostObservation} from './reconciliation';

export const GENERATION_RECONCILIATION_SOURCE={
 version:'openrouter-generation-terminal-report-20261110-v1',
 reference:'https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation',
 usageReference:'https://openrouter.ai/docs/cookbook/administration/usage-accounting',
} as const;
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const metadata=z.object({incompleteStream:incompleteStreamReceiptSchema,
 modelAttempt:z.object({requestedModel:z.string().min(1).max(200),gatewayHost:z.literal('openrouter.ai'),endpointKind:z.literal('chat-completions')})});
const terminalReport=z.object({data:z.object({id:z.string().min(1).max(128),model:z.string().min(1).max(200),
 total_cost:z.number().finite().min(0).max(1_000_000),is_byok:z.literal(false),streamed:z.literal(true),
 cancelled:z.literal(false),finish_reason:z.enum(['stop','tool_calls','length','content_filter']),
 created_at:z.string().refine(v=>Number.isFinite(Date.parse(v))),
})});
async function boundedJson(response:Response){
 if(!response.body)throw Error('Missing metadata body');
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let bytes=0;
 try{while(true){const next=await reader.read();if(next.done)break;
  bytes+=next.value.byteLength;if(bytes>262144)throw Error('Metadata body exceeds limit');parts.push(next.value);
 }return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
 }finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
}

/** Internal maintenance only: caller supplies an owned reservation, never a
 * generation ID or report. No POST, prompt/content retrieval, retry or task replay.
 * Missing/nonterminal/BYOK/mismatched metadata keeps the original unknown amount.
 */
export async function reconcileIncompleteOpenRouterGeneration(userId:string,reservationId:string,transport:typeof fetch=fetch){
 const [row]=await tenantQuery<{metrics:unknown;provider_request_hash:string|null;tariff_key:string}>(userId,
  'select metrics,provider_request_hash,tariff_key from paid_call_reservation where user_id=$1 and id=$2',[userId,reservationId]);
 const parsed=metadata.safeParse(row?.metrics);
 if(!row||!parsed.success)return {status:'unavailable' as const,reason:'no-bound-generation'};
 const {incompleteStream:receipt,modelAttempt:attempt}=parsed.data;
 const observationTariff=`a33-unbounded-${hash(`https://openrouter.ai\n/api/v1/chat/completions\n${attempt.requestedModel}`).slice(0,16)}`;
 if(!row.tariff_key.startsWith('openrouter-')&&row.tariff_key!==observationTariff)return {status:'unavailable' as const,reason:'no-bound-generation'};
 const requestHash=hash(receipt.generationId);
 if(row.provider_request_hash!==requestHash||!matchesBatchModel(receipt.reportedModel,attempt.requestedModel))
  return {status:'unavailable' as const,reason:'identity-mismatch'};
 const config=getOpenRouterConfig();
 if(config.baseUrl!=='https://openrouter.ai/api/v1')throw Error('Unexpected generation metadata endpoint');
 const url=new URL(`${config.baseUrl}/generation`);url.searchParams.set('id',receipt.generationId);
 let value:unknown;
 try{
  const init={method:'GET',headers:{Authorization:`Bearer ${config.apiKey}`,Accept:'application/json'},
   signal:AbortSignal.timeout(15000),redirect:'error' as const};
  const response=await modelRoutedTransport(transport,url,init)(url,init);
  if(!response.ok){await response.body?.cancel().catch(()=>undefined);return {status:'unavailable' as const,reason:'metadata-http-error'};}
  value=await boundedJson(response);
 }catch{return {status:'unavailable' as const,reason:'metadata-transport-error'};}
 const report=terminalReport.safeParse(value);
 if(!report.success||report.data.data.id!==receipt.generationId||!matchesBatchModel(report.data.data.model,attempt.requestedModel))
  return {status:'unavailable' as const,reason:'unverified-terminal-report'};
 const data=report.data.data,amountMicros=reportedDollarsToMicros(data.total_cost);
 if(amountMicros===null)return {status:'unavailable' as const,reason:'invalid-cost'};
 const result=await recordVerifiedCostObservation(userId,reservationId,{kind:'provider-report',amountMicros,complete:true,
  providerRequestHash:requestHash,sourceVersion:GENERATION_RECONCILIATION_SOURCE.version,
  sourceReferenceHash:hash(JSON.stringify({version:GENERATION_RECONCILIATION_SOURCE.version,...data}))});
 return {status:'observed' as const,amountMicros,providerCostUsd:data.total_cost,duplicate:result.duplicate,
  settled:'canSettle' in result?result.canSettle:null};
}
