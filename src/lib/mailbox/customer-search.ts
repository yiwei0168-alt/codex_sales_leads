import {tenantQuery} from '@/lib/rag/db';
import {companyQueryPatterns} from '@/lib/sales/company-query';

/** Search owned mailbox candidates without rewriting names, merging or fetching mail. */
export async function searchMailboxCustomers(userId:string,query:string,countryCode?:string){
 const patterns=companyQueryPatterns(query);
 if(!patterns.length)return {items:[],hasMore:false};
 const rows=await tenantQuery<{id:string;name:string;domain:string;country:string|null;confirmed:boolean}>(userId,`select id,name,domain,country,confirmed from mailbox_customer
  where user_id=$1 and not archived and merged_into is null
  and ($3::text is null or country=$3)
  and (name ilike any($2::text[]) or domain ilike any($2::text[]))
  order by case when lower(name)=$4 or lower(domain)=$4 then 0 else 1 end,name,id limit 21`,[userId,patterns,countryCode??null,query.trim().toLowerCase()]);
 return {items:rows.slice(0,20),hasMore:rows.length>20};
}
