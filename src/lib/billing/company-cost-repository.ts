import { tenantQuery } from "@/lib/rag/db";
import { companyCostKey } from "./company-cost-context";
import { summarizeCompanyCosts, type CompanyCostSource } from "./company-cost-summary";

/** Caller has checked action ownership. Every lookup independently remains tenant/task scoped. */
export async function readCompanyCosts(userId:string,actionId:string) {
  const sources=await tenantQuery<CompanyCostSource>(userId,`select reserved_micros::text,occupied_micros::text,
    estimated_micros::text,reported_micros::text,invoice_micros::text,metrics
    from paid_call_reservation where user_id=$1 and operation_id=$2`,[userId,actionId]);
  const identities=await tenantQuery<{domain:string;country_code:string}>(userId,`select distinct r.domain,s.country_code
    from lead_search_result r join lead_search_run s on s.id=r.run_id
    join market_workspace w on w.id=s.workspace_id
    where w.owner_id=$1 and s.metadata->>'assistantActionId'=$2`,[userId,actionId]);
  const names=new Map<string,{domain:string;countryCode:string}>();
  for(const identity of identities){
    try{names.set(companyCostKey(identity.domain,identity.country_code),{domain:identity.domain,countryCode:identity.country_code});}
    catch{ /* Unresolved search results cannot provide a company identity. */ }
  }
  return summarizeCompanyCosts(sources).map(row=>({...row,...(row.companyKey?names.get(row.companyKey):undefined)}));
}
