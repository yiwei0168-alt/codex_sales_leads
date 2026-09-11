import { z } from "zod";
import { tenantQuery, tenantTransaction } from "@/lib/rag/db";

export const relationshipSchema = z.object({
  country: z.string().regex(/^[A-Z]{2}$/),
  from: z.string().min(1).max(160), to: z.string().min(1).max(160),
  type: z.enum(["供货", "转售", "项目合作", "技术合作", "其他"]),
  status: z.enum(["pending", "user-confirmed", "user-rejected"]),
  basis: z.string().trim().min(1).max(2000),
  sourceUrl: z.union([z.literal(""), z.url().refine((url) => /^https?:\/\//i.test(url))]).default(""),
}).strict().refine((value) => value.from !== value.to, { message: "不能建立公司与自身的关系" });

export interface RelationshipRecord {
  id: string; from: string; to: string; type: string; status: string;
  basis: string; sourceUrl: string; updatedAt: string;
}

export async function listRelationships(userId: string, country: string): Promise<RelationshipRecord[]> {
  return tenantQuery<RelationshipRecord>(userId,
    `select r.id, f.external_id as "from", t.external_id as "to", r.relationship_type as type,
       r.status, r.basis, r.source_url as "sourceUrl", r.updated_at::text as "updatedAt"
     from user_channel_relationship r
     join sales_company f on f.id=r.from_company_id join sales_company t on t.id=r.to_company_id
     join market_workspace w on w.id=r.workspace_id
     where r.user_id=$1 and w.owner_id=$1 and w.slug='global-sales' and r.country_code=$2
     order by r.updated_at desc`, [userId, country]);
}

export async function saveRelationship(userId: string, input: z.infer<typeof relationshipSchema>) {
  const started = Date.now();
  return tenantTransaction(userId, async (client) => {
    const nodes = await client.query<{ id: string; external_id: string; workspace_id: string }>(
      `select c.id,c.external_id,w.id as workspace_id from sales_company c
       join workspace_company wc on wc.company_id=c.id join market_workspace w on w.id=wc.workspace_id
       where w.owner_id=$1 and w.slug='global-sales' and c.external_id=any($2::text[])
         and coalesce(wc.market_country_code,c.country_code)=$3`, [userId, [input.from,input.to],input.country]);
    if (nodes.rows.length !== 2) throw new Error("请选择当前国家、当前工作区内的两家公司");
    const from = nodes.rows.find((node) => node.external_id === input.from)!;
    const to = nodes.rows.find((node) => node.external_id === input.to)!;
    const previous = await client.query(`select status,basis,source_url from user_channel_relationship
      where workspace_id=$1 and country_code=$2 and from_company_id=$3 and to_company_id=$4 and relationship_type=$5`,
      [from.workspace_id,input.country,from.id,to.id,input.type]);
    const result = await client.query<{ id: string }>(
      `insert into user_channel_relationship(user_id,workspace_id,country_code,from_company_id,to_company_id,
         relationship_type,status,basis,source_url) values($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict(workspace_id,country_code,from_company_id,to_company_id,relationship_type)
       do update set status=excluded.status,basis=excluded.basis,source_url=excluded.source_url,updated_at=now() returning id`,
      [userId,from.workspace_id,input.country,from.id,to.id,input.type,input.status,input.basis,input.sourceUrl]);
    const id = result.rows[0].id;
    await client.query(`insert into workspace_audit_event(workspace_id,actor_user_id,entity_type,entity_id,action,changes)
      values($1,$2,'relationship',$3,'relationship.updated',$4)`, [from.workspace_id,userId,id,JSON.stringify({
      before: previous.rows[0] ?? null, after: input,
      efficiency: { inputItems: 1,validOutputItems: 1,downstreamUsedItems: 1,inputTokens: 0,outputTokens: 0,
        costUsd: 0,paidSearchCredits: 0,retries: 0,latencyMs: Date.now()-started,discardedReasonCounts: {},
        utilizationEfficiency: 1,optimizationOpportunity: "Reuse user-confirmed relationship without repeated inference" } })]);
    await client.query(`insert into user_outreach_memory(user_id,workspace_id,kind,external_id,title,content,market_codes,context)
      values($1,$2,'company-classification',$3,'用户渠道关系记录',$4,$5,$6)
      on conflict(user_id,external_id) do update set content=excluded.content,context=excluded.context,status='active',updated_at=now()`,
      [userId,from.workspace_id,`relationship:${id}`,JSON.stringify(input),[input.country],JSON.stringify({ scope:"relationship-only",relationshipId:id,companyExternalIds:[input.from,input.to] })]);
    return id;
  });
}
