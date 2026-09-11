import {tenantQuery} from "@/lib/rag/db";

/** Conservative owner-scope revision; only IDs/timestamps/status are hashed, no content copied. */
export async function developmentDependencyVersion(userId:string):Promise<string>{
  const rows=await tenantQuery<{version:string}>(userId,`select md5(coalesce(string_agg(part,'|' order by part),'')) as version from (
    select 'memory:'||id::text||':'||updated_at::text||':'||status as part from user_outreach_memory where user_id=$1
    union all select 'knowledge:'||id::text||':'||updated_at::text||':'||content_sha256 from knowledge_document where owner_id=$1 or visibility='shared'
    union all select 'relationship:'||id::text||':'||updated_at::text||':'||status from user_channel_relationship where user_id=$1
  ) revisions`,[userId]);
  return rows[0].version;
}
