import { requireApiSession } from "@/lib/auth/session";
import { tenantQuery } from "@/lib/rag/db";
export async function GET(_request:Request,{params}:{params:Promise<{externalId:string}>}){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const {externalId}=await params;if(externalId.length>180)return Response.json({error:"参数无效"},{status:400});
  const rows=await tenantQuery(session.userId,`select a.total_score as "totalScore",a.dimensions,a.reasons,a.risks,a.unknowns,a.evidence,
    a.updated_at::text as "assessedAt",r.scoring_policy_version as "policyVersion",r.scoring_policy_snapshot as "policySnapshot"
    from user_company_market wc join market_workspace w on w.id=wc.workspace_id join sales_company c on c.id=wc.company_id
    join lead_candidate_assessment a on a.run_id=wc.search_run_id and lower(a.domain)=lower(c.domain) and a.user_id=$1
    join lead_search_run r on r.id=a.run_id where w.owner_id=$1 and wc.candidate_id=$2 and r.country_code=wc.market_country_code order by a.updated_at desc limit 1`,[session.userId,externalId]);
  return Response.json({assessment:rows[0]??null},{headers:{"Cache-Control":"private, no-store"}});
}
