import { z } from "zod";
import { tenantQuery, tenantTransaction } from "@/lib/rag/db";
import { digest, type ExecutionContext } from "./contracts";

export function safeSkillPath(path: string) {
  return path.length <= 180 && /^[a-z0-9_.\-/]+$/i.test(path) && !path.startsWith("/") && path.split("/").every(p => p !== ".." && p !== "." && p !== "" && !/^(\.env(?:\..*)?|\.git|node_modules|id_rsa|id_ed25519)$/i.test(p)) && !path.startsWith("-");
}
export const skillImportSchema = z.object({
  skillId: z.uuid().optional(), expectedVersion: z.number().int().min(1).optional(),
  name: z.string().min(1).max(120), source: z.string().max(1000),
  files: z.record(z.string(), z.string().max(200_000)), dependencies: z.array(z.string().max(120)).max(30).default([]),
}).strict().superRefine((v, c) => {
  if (!v.files["SKILL.md"]?.trim()) c.addIssue({ code: "custom", message: "SKILL.md required" });
  if (Object.keys(v.files).length > 50 || Object.keys(v.files).some(p => !safeSkillPath(p))) c.addIssue({ code: "custom", message: "Invalid package paths or file count" });
  if (Object.values(v.files).reduce((n, s) => n + Buffer.byteLength(s), 0) > 1_000_000) c.addIssue({ code: "custom", message: "Package exceeds 1 MB" });
  if (v.skillId && !v.expectedVersion) c.addIssue({ code: "custom", message: "expectedVersion required for update" });
  if (Object.values(v.files).some(text => /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|\bsk-(?:or-v1-)?[a-z0-9]{24,}/i.test(text))) c.addIssue({ code: "custom", message: "Credentials must not be imported into Skills" });
});
export async function importSkill(context: Pick<ExecutionContext, "userId" | "role">, input: z.infer<typeof skillImportSchema>) {
  const p = skillImportSchema.parse(input);
  const scripts = Object.keys(p.files).filter(f => /\.(py|js|mjs)$/.test(f));
  const validation = { instructions: "available", scripts: scripts.length ? "unverified-requires-sandbox" : "none", dependencies: p.dependencies.length ? "not-installed" : /^(?:github:|https:\/\/)/.test(p.source) ? "not-declared" : "none",
    warnings: Object.values(p.files).some(text => /docker\.sock|\.env|OAuth.?Token|API.?KEY|host filesystem/i.test(text)) ? ["Package references sensitive resources; such access is not granted"] : [] };
  return tenantTransaction(context.userId, async client => {
    let id = p.skillId, version = 1;
    if (id) {
      const current = await client.query<{ current_version: number }>("select current_version from agent_skill where id=$1 and owner_id=$2 for update", [id, context.userId]);
      if (current.rows[0]?.current_version !== p.expectedVersion) throw new Error("Skill version changed or not owned");
      const latest = await client.query<{ next: number }>("select coalesce(max(version),0)+1 as next from agent_skill_version where skill_id=$1", [id]);
      version = latest.rows[0].next;
    } else {
      id = (await client.query<{ id: string }>("insert into agent_skill(owner_id,name,scope,enabled) values($1,$2,$3,$4) returning id", [context.userId, p.name, context.role === "admin" ? "global" : "account",scripts.length===0&&p.dependencies.length===0])).rows[0].id;
    }
    await client.query("insert into agent_skill_version(skill_id,version,content_hash,source,files,dependencies,validation) values($1,$2,$3,$4,$5,$6,$7)", [id, version, digest(p.files), p.source, JSON.stringify(p.files), JSON.stringify(p.dependencies), JSON.stringify(validation)]);
    // Global updates become unpublished until exact publication confirmation. Pinned running versions are retained.
    await client.query("update agent_skill set name=$3,current_version=$4,enabled=enabled and $5,published=case when scope='global' then false else published end,updated_at=now() where id=$1 and owner_id=$2", [id, context.userId, p.name, version,scripts.length===0&&p.dependencies.length===0]);
    return { id, version, validation, scope: context.role === "admin" ? "global-pending-publication" : "account" };
  }, context.role);
}
export async function listSkills(userId: string) {
  return tenantQuery(userId, "select id,name,scope,current_version,enabled,published,owner_id=$1 as owned from agent_skill order by name,id", [userId]);
}
export async function listSkillsPage(userId:string,offset:number){
  const rows=await tenantQuery<{id:string;name:string;scope:string;current_version:number;enabled:boolean;published:boolean;owned:boolean;
    source:string;validation:Record<string,unknown>;created_at:string}>(userId,`select s.id,s.name,s.scope,s.current_version,s.enabled,s.published,s.owner_id=$1 as owned,
    v.source,v.validation,v.created_at::text from agent_skill s join agent_skill_version v
      on v.skill_id=s.id and v.version=s.current_version
    order by s.updated_at desc,s.id limit 13 offset $2`,[userId,offset]);
  return {items:rows.slice(0,12),hasMore:rows.length>12};
}
export async function listOwnedSkillVersions(userId:string,skillId:string){
  return tenantQuery<{version:number;source:string;validation:Record<string,unknown>;created_at:string}>(userId,`select v.version,v.source,v.validation,v.created_at::text
    from agent_skill_version v join agent_skill s on s.id=v.skill_id
    where s.id=$1 and s.owner_id=$2 order by v.version desc limit 30`,[skillId,userId]);
}
export async function readSkill(context: ExecutionContext, skillId: string) {
  return tenantTransaction(context.userId, async client => {
    const accessible = await client.query<{ current_version: number }>("select current_version from agent_skill where id=$1 and enabled", [skillId]);
    if (!accessible.rows[0]) return null;
    const pinned = await client.query("select version from agent_run_skill where user_id=$1 and run_id=$2 and skill_id=$3", [context.userId, context.runId, skillId]);
    if (!pinned.rowCount) await client.query("insert into agent_run_skill(user_id,run_id,skill_id,version) values($1,$2,$3,$4) on conflict do nothing", [context.userId, context.runId, skillId, accessible.rows[0].current_version]);
    return (await client.query("select v.* from agent_skill_version v join agent_run_skill p on p.skill_id=v.skill_id and p.version=v.version where p.user_id=$1 and p.run_id=$2 and p.skill_id=$3", [context.userId, context.runId, skillId])).rows[0] ?? null;
  }, context.role);
}
export async function changeSkill(context: Pick<ExecutionContext, "userId" | "role">, input: { id: string; version: number; operation: "enable" | "disable" | "publish" | "rollback" },humanInitiated=false) {
  if (input.operation === "publish" && context.role !== "admin") throw new Error("Administrator required");
  return tenantTransaction(context.userId, async client => {
    const version = await client.query<{validation:{scripts?:string;dependencies?:string}}>("select v.validation from agent_skill s join agent_skill_version v on v.skill_id=s.id where s.id=$1 and s.owner_id=$2 and v.version=$3 for update of s", [input.id, context.userId, input.version]);
    if (!version.rowCount) throw new Error("Skill/version not owned");
    if(!humanInitiated&&["enable","rollback"].includes(input.operation)
      &&(version.rows[0].validation.scripts!=="none"||version.rows[0].validation.dependencies!=="none"))
      throw new Error("Script or dependency Skill requires human approval");
    if (input.operation === "publish") {
      const published = await client.query("update agent_skill set published=true,enabled=true,updated_at=now() where id=$1 and owner_id=$2 and scope='global' and current_version=$3", [input.id, context.userId, input.version]);
      if (!published.rowCount) throw new Error("Global Skill version changed; publication requires a new confirmation");
    }
    else if (input.operation === "rollback") await client.query("update agent_skill set current_version=$3,published=case when scope='global' then false else published end where id=$1 and owner_id=$2", [input.id, context.userId, input.version]);
    else await client.query("update agent_skill set enabled=$3,published=case when scope='global' then false else published end,updated_at=now() where id=$1 and owner_id=$2 and current_version=$4", [input.id, context.userId, input.operation === "enable", input.version]).then(r => { if (!r.rowCount) throw new Error("Skill version changed"); });
    return { updated: true };
  }, context.role);
}
