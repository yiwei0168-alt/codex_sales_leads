import {z} from 'zod';
import {tenantQuery} from '@/lib/rag/db';

export const companyListInput=z.object({countryCode:z.string().regex(/^[A-Z]{2}$/).optional(),
 offset:z.number().int().min(0).max(100000).default(0)}).strict();
export const companyListData=z.object({items:z.array(z.object({id:z.string().min(1),name:z.string(),domain:z.string(),
 countryCode:z.string(),roles:z.array(z.string())})),offset:z.number().int().min(0),hasMore:z.boolean(),
 nextOffset:z.number().int().min(0).nullable(),paginationLimitReached:z.boolean(),scope:z.string()});

/** Stable account/market membership pages; no discovery, scoring or identity merge. */
export async function listOwnedSalesCompanies(userId:string,input:unknown){
 const p=companyListInput.parse(input);
 const rows=await tenantQuery<{id:string;name:string;domain:string;countryCode:string;roles:unknown}>(userId,
  `select wc.candidate_id as id,coalesce(wc.record->>'displayName',c.canonical_name) as name,c.domain,
    wc.market_country_code as "countryCode",wc.record->'roles' as roles
   from user_company_market wc join sales_company c on c.id=wc.company_id join market_workspace w on w.id=wc.workspace_id
   where w.owner_id=$1 and w.slug='global-sales' and ($2::text is null or wc.market_country_code=$2)
   order by wc.candidate_id collate "C" limit 21 offset $3`,[userId,p.countryCode??null,p.offset]);
 const hasMore=rows.length>20,paginationLimitReached=hasMore&&p.offset+20>100000;
 return companyListData.parse({items:rows.slice(0,20).map(r=>({...r,roles:Array.isArray(r.roles)?r.roles.filter((v):v is string=>typeof v==='string'):[]})),
  offset:p.offset,hasMore,nextOffset:hasMore&&!paginationLimitReached?p.offset+20:null,paginationLimitReached,
  scope:'Current-account saved sales company/market memberships in the global-sales workspace, optionally filtered by country. IDs are for company_read/company_assessment_read; not mailbox customer IDs. Roles are saved labels, not newly verified classifications; a company may have several roles. Follow every page before claiming complete coverage. Pages reflect current stored state, not a frozen snapshot.'});
}
