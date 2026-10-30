import{currentSpendContext}from"@/lib/billing/context";
import{companyCostKey}from"@/lib/billing/company-cost-context";
import{BudgetDeniedError}from"@/lib/billing/policy";
import{paidRequestFingerprint}from"@/lib/billing/paid-request-fingerprint";
import{tenantQuery}from"@/lib/rag/db";
import{tavilySearchBody,type TavilySearchInput}from"@/providers/tavily";
import{findReusablePublicEvidence}from"./public-evidence-repository";
import type{LeadWorkflowCandidate}from"./types";

/** A completed HTTP search is not a qualification result. Reuse only saved public
 * evidence; never synthesize a lost response or turn an absent source into a fact.
 * Financial 'unknown' does not negate an independently recorded HTTP 200 receipt.
 */
export async function reuseCompletedCorrectionSupplement(candidate:LeadWorkflowCandidate,countryCode:string,input:TavilySearchInput){
  const scope=currentSpendContext();if(!scope||scope.stage!=="correcting-evidence")return null;
  const base=(process.env.TAVILY_BASE_URL?.trim()||"https://api.tavily.com").replace(/\/$/,"");
  const url=new URL(base+"/search");
  if(url.protocol!=="https:"||url.hostname!=="api.tavily.com"||url.username||url.password)return null;
  const fingerprint=paidRequestFingerprint("POST",url,tavilySearchBody(input));
  try{
  const rows=await tenantQuery<{id:string;created_at:string}>(scope.userId,`select id,created_at::text from paid_call_reservation
    where user_id=$1 and operation_id=$2 and stage=$3 and request_fingerprint=$4
      and metrics->'modelAttempt'='null'::jsonb and metrics->>'validOutputItems'='1'
      and metrics->'providerUsage'->>'httpStatus'='200'
      and metrics->'costAttribution'->'companyKeys' ? $5
      and status<>'reserved' order by created_at desc limit 1`,
  [scope.userId,scope.operationId,scope.stage,fingerprint,companyCostKey(candidate.domain,countryCode)]);
  if(!rows[0])return null;
  const saved=await findReusablePublicEvidence({domain:candidate.domain,countryCode,
    evidenceRunId:candidate.evidenceSnapshotRunId,includeStale:false,maximumChunks:20});
  return{receiptId:rows[0].id,evidence:saved.evidence.filter(item=>Date.parse(item.capturedAt)>=Date.parse(rows[0].created_at))};
  }catch{throw new BudgetDeniedError("paid-request-already-recorded");}
}
