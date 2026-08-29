import { chunkDocument } from "@/lib/rag/chunker";
import { tenantQuery, tenantTransaction } from "@/lib/rag/db";
import { embedTexts } from "@/lib/rag/openai-provider";
import type { PoolClient } from "pg";
import type { OutreachKnowledgeItem } from "./types";

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

export async function upsertOutreachSource(userId: string, input: {
  externalId: string;
  title: string;
  content: string;
  kind: "company-profile" | "distribution-policy";
  priorityWeight: number;
  sourceRefs: Record<string, unknown>;
}): Promise<number> {
  const chunks = chunkDocument(input.content);
  const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));
  await tenantTransaction(userId, async (client) => {
    await client.query(
      `delete from outreach_knowledge_item
        where visibility='shared' and external_id like $1`, [`${input.externalId}:chunk:%`]);
    for (const [index, chunk] of chunks.entries()) {
      await client.query(
        `insert into outreach_knowledge_item (
           owner_id, visibility, kind, external_id, title, content, priority_weight, source_refs, embedding
         ) values (null, 'shared', $1, $2, $3, $4, $5, $6, $7::vector)
         on conflict (coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), external_id)
         do update set title=excluded.title, content=excluded.content, kind=excluded.kind,
           priority_weight=excluded.priority_weight, source_refs=excluded.source_refs,
           embedding=excluded.embedding, approval_status='active', updated_at=now()`,
        [input.kind, `${input.externalId}:chunk:${index}`, `${input.title} · ${chunk.headingPath.at(-1) ?? `Section ${index + 1}`}`,
          chunk.content, input.priorityWeight, JSON.stringify({ ...input.sourceRefs, headingPath: chunk.headingPath }),
          vectorLiteral(embeddings[index])],
      );
    }
  }, "admin");
  return chunks.length;
}

export async function embedPendingOutreachKnowledge(userId: string): Promise<number> {
  const rows = await tenantQuery<{ id: string; content: string }>(userId,
    `select id, content from outreach_knowledge_item
      where approval_status='active' and embedding is null
        and (visibility='shared' or owner_id=$1)
      order by priority_weight desc, created_at`, [userId], "admin");
  if (!rows.length) return 0;
  const embeddings = await embedTexts(rows.map((row) => row.content));
  await tenantTransaction(userId, async (client) => {
    for (const [index, row] of rows.entries()) {
      await client.query(`update outreach_knowledge_item set embedding=$2::vector, updated_at=now() where id=$1`,
        [row.id, vectorLiteral(embeddings[index])]);
    }
  }, "admin");
  return rows.length;
}

export async function searchOutreachKnowledge(
  userId: string,
  question: string,
  queryEmbedding: number[],
  marketCodes: string[],
  roles: string[],
  limit = 5,
): Promise<OutreachKnowledgeItem[]> {
  const rows = await tenantQuery<{
    id: string; kind: OutreachKnowledgeItem["kind"]; title: string; content: string;
    market_codes: string[]; channel_roles: string[]; priority_weight: number;
    source_refs: Record<string, unknown>; score: number;
  }>(userId,
    `with eligible as (
       select * from outreach_knowledge_item
        where approval_status='active' and embedding is not null
          and visibility='shared'
     ), vectors as (
       select id, row_number() over (order by embedding <=> $1::vector) as rank,
              greatest(1-(embedding <=> $1::vector), 0)::float8 as similarity
         from eligible order by embedding <=> $1::vector limit 20
     ), keywords as (
       select id, row_number() over (order by ts_rank_cd(search_vector, websearch_to_tsquery('simple', $2)) desc) as rank
         from eligible where search_vector @@ websearch_to_tsquery('simple', $2)
        order by ts_rank_cd(search_vector, websearch_to_tsquery('simple', $2)) desc limit 20
     )
     select e.id, e.kind, e.title, e.content, e.market_codes, e.channel_roles,
            e.priority_weight, e.source_refs,
            (coalesce(v.similarity,0)*0.55
             + least(e.priority_weight/3.0,1)*0.18
             + case when e.market_codes && $3::text[] then 0.20 when cardinality(e.market_codes)=0 then 0.04 else 0 end
             + case when e.channel_roles && $4::text[] then 0.05 else 0 end
             + least(coalesce(1.0/(30+k.rank),0)*3,0.08))::float8 as score
       from eligible e
       left join vectors v on v.id=e.id
       left join keywords k on k.id=e.id
      where v.id is not null or k.id is not null
      order by score desc limit ($5 * 3)`,
    [vectorLiteral(queryEmbedding), question, marketCodes, roles, limit]);
  const privateRows = await tenantQuery<{
    id: string; kind: "email-style" | "cooperation-path-preference" | "user-approved-marketing-claim";
    title: string; content: string; market_codes: string[]; channel_roles: string[];
    context: Record<string, unknown>; score: number;
  }>(userId,
    `with eligible as (
       select * from user_outreach_memory
        where user_id=$6 and status='active' and embedding is not null
          and (kind <> 'user-approved-marketing-claim' or usage_scope='external-use-approved')
     ), vectors as (
       select id, greatest(1-(embedding <=> $1::vector), 0)::float8 as similarity
         from eligible order by embedding <=> $1::vector limit 20
     ), keywords as (
       select id, ts_rank_cd(search_vector, websearch_to_tsquery('simple', $2))::float8 as similarity
         from eligible where search_vector @@ websearch_to_tsquery('simple', $2) limit 20
     )
     select e.id, e.kind, e.title, e.content, e.market_codes, e.channel_roles, e.context,
            (greatest(coalesce(v.similarity,0),coalesce(k.similarity,0))*0.55
             + 0.28
             + case when e.market_codes && $3::text[] then 0.12 when cardinality(e.market_codes)=0 then 0.04 else 0 end
             + case when e.channel_roles && $4::text[] then 0.05 else 0 end)::float8 as score
       from eligible e left join vectors v on v.id=e.id left join keywords k on k.id=e.id
      where v.id is not null or k.id is not null order by score desc limit $5`,
    [vectorLiteral(queryEmbedding), question, marketCodes, roles, limit, userId]);
  const mapped = rows.map((row) => ({
    id: row.id, kind: row.kind, title: row.title, content: row.content.slice(0, 1_200),
    marketCodes: row.market_codes, channelRoles: row.channel_roles,
    priorityWeight: row.priority_weight, sourceRefs: row.source_refs, score: row.score,
  }));
  const privateMapped: OutreachKnowledgeItem[] = privateRows.map((row) => ({
    id: row.id,
    kind: row.kind === "email-style" ? "feedback-memory" : row.kind,
    title: row.title,
    content: row.content.slice(0, 1_200),
    marketCodes: row.market_codes,
    channelRoles: row.channel_roles,
    priorityWeight: 3,
    sourceRefs: { ...row.context, privateUserMemory: true, priority: "user-confirmed" },
    score: row.score,
  }));
  const selected: OutreachKnowledgeItem[] = [...privateMapped.slice(0, Math.min(2, limit))];
  const addFirst = (predicate: (item: OutreachKnowledgeItem) => boolean) => {
    const item = mapped.find((candidate) => predicate(candidate) && !selected.some((existing) => existing.id === candidate.id));
    if (item) selected.push(item);
  };
  addFirst((item) => item.kind === "market-proof" && item.marketCodes.some((code) => marketCodes.includes(code)));
  addFirst((item) => item.kind === "distribution-policy");
  addFirst((item) => item.kind === "company-profile");
  addFirst((item) => item.kind === "feedback-memory");
  mapped.forEach((item) => { if (selected.length < limit && !selected.some((existing) => existing.id === item.id)) selected.push(item); });
  return selected.slice(0, limit);
}

export async function storeFeedbackMemory(userId: string, input: {
  feedbackId: string;
  summary: string;
  marketCodes: string[];
  channelRoles: string[];
  reason: string;
}): Promise<string> {
  const embedding = await prepareFeedbackMemory(input.summary);
  return tenantTransaction(userId, (client) => insertFeedbackMemory(client, userId, input, embedding));
}

export async function prepareFeedbackMemory(summary: string): Promise<number[]> {
  const [embedding] = await embedTexts([summary]);
  return embedding;
}

export async function insertFeedbackMemory(client: PoolClient, userId: string, input: {
  feedbackId: string;
  summary: string;
  marketCodes: string[];
  channelRoles: string[];
  reason: string;
}, embedding: number[]): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into user_outreach_memory (
       user_id, workspace_id, kind, external_id, title, content, market_codes, channel_roles,
       context, usage_scope, affects_objective_scoring, embedding
     ) select $1,d.workspace_id,'email-style',$2,'Approved email style preference',$3,$4,$5,$6,
              'internal-learning',false,$7::vector
         from outreach_feedback f join outreach_draft d on d.id=f.draft_id
        where f.id=$8 and f.user_id=$1
     on conflict (user_id, external_id) do update set content=excluded.content,
       market_codes=excluded.market_codes, channel_roles=excluded.channel_roles,
       context=excluded.context, embedding=excluded.embedding, status='active', updated_at=now()
     returning id`,
    [userId, `feedback:${input.feedbackId}`, input.summary, input.marketCodes, input.channelRoles,
      JSON.stringify({ feedbackId: input.feedbackId, reason: input.reason,
        provenance: "agent-screened-user-feedback", priority: "user-confirmed" }),
      vectorLiteral(embedding), input.feedbackId]);
  return result.rows[0].id;
}

export async function storeUserApprovedMarketingClaim(userId: string, input: {
  workspaceId?: string;
  externalId: string;
  claim: string;
  marketCodes: string[];
  channelRoles: string[];
  externalUseApproved: boolean;
  confirmationContext: string;
}): Promise<string> {
  const [embedding] = await embedTexts([input.claim]);
  const rows = await tenantQuery<{ id: string }>(userId,
    `insert into user_outreach_memory (
       user_id, workspace_id, kind, external_id, title, content, market_codes, channel_roles,
       context, usage_scope, affects_objective_scoring, embedding
     ) values ($1,$2,'user-approved-marketing-claim',$3,'User-approved marketing claim',$4,$5,$6,$7,$8,false,$9::vector)
     on conflict (user_id, external_id) do update set content=excluded.content,
       market_codes=excluded.market_codes, channel_roles=excluded.channel_roles,
       context=excluded.context, usage_scope=excluded.usage_scope,
       affects_objective_scoring=false, embedding=excluded.embedding, status='active', updated_at=now()
     returning id`,
    [userId, input.workspaceId ?? null, input.externalId, input.claim, input.marketCodes,
      input.channelRoles, JSON.stringify({ confirmationContext: input.confirmationContext,
        provenance: "user-confirmed", objectiveFact: false, scoringEvidence: false }),
      input.externalUseApproved ? "external-use-approved" : "internal-learning", vectorLiteral(embedding)]);
  return rows[0].id;
}
