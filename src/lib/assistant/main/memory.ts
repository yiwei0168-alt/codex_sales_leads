import { z } from "zod";
import { tenantQuery, tenantTransaction } from "@/lib/rag/db";
import type { ExecutionContext } from "./contracts";
export const memoryInputSchema = z.object({
  key: z.string().min(1).max(160), content: z.string().min(1).max(8000),
  kind: z.enum(["preference", "policy", "company-decision"]), scope: z.enum(["account", "global"]).default("account"), mandatory: z.boolean().default(false),
  markets: z.array(z.string().regex(/^[A-Z]{2}$/)).max(100).default([]), companies: z.array(z.string().max(180)).max(100).default([]),
  validUntil: z.iso.datetime().optional(), expectedVersion: z.number().int().min(1).optional(),
}).strict();
type MemoryInput = z.infer<typeof memoryInputSchema>;
export async function saveMemory(context: ExecutionContext, input: MemoryInput, automatic: boolean) {
  const p = memoryInputSchema.parse(input);
  if ((p.scope === "global" || p.mandatory) && context.role !== "admin") throw new Error("Administrator policy required");
  if (automatic && (p.kind !== "preference" || p.scope !== "account")) throw new Error("Only account preferences may be automatic");
  return tenantTransaction(context.userId, async client => {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`memory:${context.userId}:${p.scope}:${p.kind}:${p.key}`]);
    const current = await client.query<{ id: string; current_version: number; source_kind: string; active:boolean }>("select id,current_version,source_kind,active from agent_memory where owner_id=$1 and scope=$2 and kind=$3 and memory_key=$4 for update", [context.userId, p.scope, p.kind, p.key]);
    const prior = current.rows[0];
    if (prior && automatic && prior.source_kind === "explicit") return { id: prior.id, saved: false, reason: "Explicit preference preserved" };
    if (prior && p.expectedVersion !== prior.current_version) throw new Error("Memory version changed; read before updating");
    const source = await client.query<{ id: string }>("select id from assistant_message where user_id=$1 and metadata->>'runId'=$2::text and role='user' order by created_at limit 1", [context.userId, context.runId]);
    if (!source.rows[0]) throw new Error("Source user message required");
    const version = prior ? (await client.query<{ next: number }>("select max(version)+1 as next from agent_memory_version where memory_id=$1", [prior.id])).rows[0].next : 1;
    const id = prior?.id ?? (await client.query<{ id: string }>(`insert into agent_memory(owner_id,scope,kind,memory_key,source_kind) values($1,$2,$3,$4,$5) returning id`, [context.userId, p.scope, p.kind, p.key, automatic ? "automatic" : "explicit"])).rows[0].id;
    await client.query("insert into agent_memory_version(memory_id,version,content,scope_snapshot,source_run_id,source_message_id) values($1,$2,$3,$4,$5,$6)", [id, version, p.content, JSON.stringify({ mandatory: p.mandatory, markets: p.markets, companies: p.companies, validUntil: p.validUntil ?? null, sourceKind: automatic ? "automatic" : "explicit", previousVersion:prior?.current_version??null, previousActive:prior?.active??false }), context.runId, source.rows[0].id]);
    await client.query(`update agent_memory set current_version=$3,mandatory=$4,market_codes=$5,company_ids=$6,valid_until=$7,
      source_kind=$8,active=true,updated_at=now() where id=$1 and owner_id=$2`, [id, context.userId, version, p.mandatory, p.markets, p.companies, p.validUntil ?? null, automatic ? "automatic" : "explicit"]);
    await client.query("insert into agent_run_event(user_id,run_id,kind,payload) values($1,$2,'memory_saved',$3)", [context.userId, context.runId, JSON.stringify({ id, version, kind: p.kind, key: p.key, automatic, undoAvailable: true })]);
    return { id, version, saved: true, automatic, undoAvailable: true };
  }, context.role);
}
export async function loadMemory(userId: string, scope?: { market?: string; company?: string }) {
  return tenantQuery(userId, `select m.id,m.scope,m.kind,m.memory_key,m.current_version,m.mandatory,m.source_kind,m.market_codes,m.company_ids,m.valid_until,v.content,v.source_run_id,v.source_message_id
    ,m.owner_id=app_current_user_id() as owned from agent_memory m join agent_memory_version v on v.memory_id=m.id and v.version=m.current_version
    where m.active and m.valid_from<=now() and (m.valid_until is null or m.valid_until>now())
      and ($1::text is null or cardinality(m.market_codes)=0 or $1=any(m.market_codes))
      and ($2::text is null or cardinality(m.company_ids)=0 or $2=any(m.company_ids))
    order by m.mandatory desc,(m.scope='global') desc,m.updated_at desc,m.id`, [scope?.market ?? null, scope?.company ?? null]);
}
export async function undoMemory(userId: string, id: string, version: number, role: "admin" | "member" = "member") {
  return tenantTransaction(userId, async client => {
    const rows = await client.query<{ current_version: number; active:boolean; scope_snapshot:{previousVersion?:number|null;previousActive?:boolean} }>(`select m.current_version,m.active,v.scope_snapshot from agent_memory m
      join agent_memory_version v on v.memory_id=m.id and v.version=m.current_version where m.owner_id=$1 and m.id=$2 for update of m`, [userId, id]);
    const current=rows.rows[0];
    if (current?.current_version !== version || !current.active) return false;
    // Undo never destroys provenance. Later explicit versions cannot be undone by an old notification.
    // A new version can branch from an earlier undo. Restore its actual predecessor,
    // including inactive state, rather than the numerically preceding version.
    const predecessor=current.scope_snapshot.previousVersion===undefined?(version===1?null:version-1):current.scope_snapshot.previousVersion;
    if (predecessor === null) await client.query("update agent_memory set active=false,updated_at=now() where id=$1 and owner_id=$2", [id, userId]);
    else {
      if(!Number.isSafeInteger(predecessor)||predecessor<1||predecessor>=version)throw new Error("Memory predecessor is invalid");
      const previous = await client.query<{ version: number; scope_snapshot: { mandatory: boolean; markets: string[]; companies: string[]; validUntil: string | null; sourceKind: string } }>("select version,scope_snapshot from agent_memory_version where memory_id=$1 and version=$2", [id, predecessor]);
      const prior = previous.rows[0];if(!prior)throw new Error("Memory predecessor is missing");const s = prior.scope_snapshot;
      await client.query("update agent_memory set current_version=$3,mandatory=$4,market_codes=$5,company_ids=$6,valid_until=$7,source_kind=$8,active=$9,updated_at=now() where id=$1 and owner_id=$2", [id, userId, prior.version, s.mandatory, s.markets, s.companies, s.validUntil, s.sourceKind,current.scope_snapshot.previousActive??true]);
    }
    return true;
  }, role);
}
