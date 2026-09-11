import { tenantQuery } from "@/lib/rag/db";
import type { ProductActionPlan } from "./types";
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
  const pattern=`%${plan.companyQuery.replace(/[\\%_]/g,"\\$&")}%`;
  const rows=await tenantQuery<{id:string;name:string;countryCode:string}>(userId,`select c.external_id as id,c.canonical_name as name,coalesce(wc.market_country_code,c.country_code) as "countryCode"
    from sales_company c join workspace_company wc on wc.company_id=c.id join market_workspace w on w.id=wc.workspace_id
    where w.owner_id=$1 and w.slug='global-sales' and (c.canonical_name ilike $2 escape E'\\\\' or c.domain ilike $2 escape E'\\\\')
    and ($3::text is null or coalesce(wc.market_country_code,c.country_code)=$3)
    and (cardinality($4::text[])=0 or coalesce(wc.user_overrides->'roles',c.record->'roles','[]'::jsonb) ?| $4::text[])
    order by wc.updated_at desc,c.id limit 21`,[userId,pattern,plan.countryCode??null,plan.roles??[]]);
  return {...plan,companies:rows.slice(0,20),hasMore:rows.length>20};
}
