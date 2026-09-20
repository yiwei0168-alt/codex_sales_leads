import {z} from "zod";
import {tenantQuery} from "@/lib/rag/db";
import {loadMemory} from "./memory";

type Scope={market?:string;company?:string};
export function historicalMarketCodes(market?:string){
  if(!market)return null;
  const code=market==="UK"?"GB":market;
  return [code,...(code==="GB"?["UK"]:[]),...(["NL","BE","LU"].includes(code)?["BENELUX"]:[])];
}

/** Policy applicability is structured, never gated on embedding similarity. */
export async function loadDecisionMemory(userId:string,scope?:Scope):Promise<Record<string,unknown>[]>{
  const [current,legacy]=await Promise.all([
    loadMemory(userId,scope),
    tenantQuery(userId,`select id,'outreach_knowledge_item'::text as source_store,'global'::text as scope,
      'policy'::text as kind,external_id as memory_key,false as mandatory,'legacy-active'::text as source_kind,
      market_codes,channel_roles,source_refs,updated_at::text as source_revision,title,content,false as owned
      from outreach_knowledge_item where visibility='shared' and approval_status='active' and kind='distribution-policy'
        and ($1::text[] is null or cardinality(market_codes)=0 or market_codes && $1::text[])
        and ($2::text is null or coalesce(source_refs->>'companyExternalId','') in('',$2))
      order by updated_at desc,id`,[historicalMarketCodes(scope?.market),scope?.company??null]),
  ]);
  // Shared historical policy is a default, never a newly invented mandatory rule.
  return [...current.map(record=>({...record,source_store:"agent_memory"})),...legacy];
}

export const historicalMemoryInput=z.object({
  query:z.string().max(1000).default(""),market:z.string().regex(/^[A-Z]{2}$/).optional(),
  company:z.string().min(1).max(180).optional(),role:z.string().min(1).max(80).optional(),
  offset:z.number().int().min(0).max(100000).default(0),limit:z.number().int().min(1).max(50).default(20),
}).strict();

export async function searchHistoricalMemory(userId:string,input:z.infer<typeof historicalMemoryInput>){
  const p=historicalMemoryInput.parse(input);
  const rows=await tenantQuery(userId,`with historical as (
    select id,'user_outreach_memory'::text as source_store,kind,title,content,market_codes,channel_roles,
      context as source_refs,usage_scope,updated_at,true as owned,false as mandatory
    from user_outreach_memory where user_id=$1 and status='active'
    union all
    select id,'outreach_knowledge_item'::text,kind,title,content,market_codes,channel_roles,
      source_refs,'shared-default'::text,updated_at,false,false
    from outreach_knowledge_item where visibility='shared' and approval_status='active' and kind='feedback-memory'
  ) select id,source_store,kind,title,content,market_codes,channel_roles,source_refs,usage_scope,
      updated_at::text as source_revision,owned,mandatory from historical
    where ($2='' or title ilike $3 escape E'\\\\' or content ilike $3 escape E'\\\\')
      and ($4::text[] is null or cardinality(market_codes)=0 or market_codes && $4::text[])
      and ($5::text is null or coalesce(source_refs->>'companyExternalId','') in('',$5))
      and ($6::text is null or cardinality(channel_roles)=0 or $6=any(channel_roles))
    order by updated_at desc,source_store,id limit $7 offset $8`,
  [userId,p.query,`%${p.query.replace(/[\\%_]/g,"\\$&")}%`,historicalMarketCodes(p.market),p.company??null,p.role??null,p.limit+1,p.offset]);
  return {items:rows.slice(0,p.limit),hasMore:rows.length>p.limit,offset:p.offset,limit:p.limit,
    boundary:"Historical guidance retains original identity and scope. Internal-learning content is not permission for external claims; company-classification mirrors company state and cannot redefine official scores."};
}
