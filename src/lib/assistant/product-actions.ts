import { tenantQuery } from "@/lib/rag/db";
import type { ProductActionPlan } from "./types";
import {companyQueryPatterns} from '@/lib/sales/company-query';
import { startOperation,finishOperation,bestEffortMetric } from "@/lib/operation-metrics";
export async function measuredProductActionCompanies(userId:string,plan:ProductActionPlan){
  const started=Date.now();const id=await startOperation(userId,"local-company-lookup",1,plan.companyQuery.length);
  let result:Awaited<ReturnType<typeof findProductActionCompanies>>|undefined;
  try{result=await findProductActionCompanies(userId,plan);return result;}
  finally{const projected=result?.companies.length??0;const fetched=projected+(result?.hasMore?1:0);
    await bestEffortMetric(()=>finishOperation(userId,id,result?"completed":"failed",{inputItems:1,inputCharacters:plan.companyQuery.length,outputItems:fetched,validOutputItems:projected,downstreamUsedItems:result?projected:0,
      inputTokens:0,cachedInputTokens:0,outputTokens:0,apiCredits:0,costUsd:0,latencyMs:Date.now()-started,retries:0,
      discardedReasonCounts:!result?{lookupFailed:1}:result.hasMore?{paginationSentinel:1}:{},utilizationEfficiency:fetched?projected/fetched:null,
      usageBoundary:"projected-to-message-not-user-selected",optimizationOpportunity:"Prefer literal local lookup to duplicated external search; measure selected company separately"}));}
}
export async function findProductActionCompanies(userId:string,plan:ProductActionPlan){
  // Escape LIKE metacharacters: user/company text is a literal, not a wildcard program.
  const patterns=companyQueryPatterns(plan.companyQuery);
  const rows=await tenantQuery<{id:string;name:string;countryCode:string}>(userId,`select wc.candidate_id as id,coalesce(wc.record->>'displayName',c.canonical_name) as name,wc.market_country_code as "countryCode"
    from sales_company c join user_company_market wc on wc.company_id=c.id join market_workspace w on w.id=wc.workspace_id
    where w.owner_id=$1 and w.slug='global-sales' and (c.canonical_name ilike any($2::text[]) or c.domain ilike any($2::text[]) or wc.record->>'displayName' ilike any($2::text[]))
    and ($3::text is null or wc.market_country_code=$3)
    and (cardinality($4::text[])=0 or coalesce(wc.record->'roles','[]'::jsonb) ?| $4::text[])
    order by case when lower(c.canonical_name)=$5 or lower(c.domain)=$5 or lower(wc.record->>'displayName')=$5 then 0 else 1 end,wc.updated_at desc,c.id limit 21`,[userId,patterns,plan.countryCode??null,plan.roles??[],plan.companyQuery.trim().toLowerCase()]);
  return {...plan,companies:rows.slice(0,20),hasMore:rows.length>20};
}
