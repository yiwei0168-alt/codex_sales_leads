import nextEnv from "@next/env";

import { OWNER_USER_ID } from "../src/lib/auth/config";
import { getPool, tenantQuery } from "../src/lib/rag/db";

nextEnv.loadEnvConfig(process.cwd());
const releaseKey = process.argv.find(arg => arg.startsWith("--release="))?.slice("--release=".length)
  ?? "rag-v3-shadow-2026-09-18";
try {
  const summary = await tenantQuery<{
    reason:string; attributeKey:string; sourceNature:string; items:number; entities:number; assets:number;
  }>(OWNER_USER_ID, `select q.reason,f.attribute_key as "attributeKey",a.source_nature as "sourceNature",
      count(*)::int items,count(distinct f.entity_id)::int entities,count(distinct q.asset_id)::int assets
    from knowledge_review_queue_v3 q join knowledge_release_v3 r on r.id=q.release_id
    join knowledge_fact_v3 f on f.id=q.fact_id join knowledge_source_revision_v3 sr on sr.id=f.source_revision_id
    join knowledge_asset a on a.id=sr.asset_id
    where r.release_key=$1 and q.status='open' group by q.reason,f.attribute_key,a.source_nature
    order by count(*) desc,q.reason,f.attribute_key,a.source_nature`, [releaseKey], "admin");
  const totals = summary.reduce((result,row) => {
    result.items += row.items;
    result.byReason[row.reason] = (result.byReason[row.reason] ?? 0) + row.items;
    result.byAttribute[row.attributeKey] = (result.byAttribute[row.attributeKey] ?? 0) + row.items;
    return result;
  }, {items:0,byReason:{} as Record<string,number>,byAttribute:{} as Record<string,number>});
  const conflictExamples = await tenantQuery(OWNER_USER_ID, `select e.canonical_key as "entityKey",
      f.entity_version as "entityVersion",f.market,f.attribute_key as "attributeKey",
      array_agg(distinct f.raw_value order by f.raw_value) as values,count(*)::int items
    from knowledge_review_queue_v3 q join knowledge_release_v3 r on r.id=q.release_id
    join knowledge_fact_v3 f on f.id=q.fact_id join knowledge_entity e on e.id=f.entity_id
    where r.release_key=$1 and q.status='open' and q.reason='conflict'
    group by e.canonical_key,f.entity_version,f.market,f.attribute_key order by count(*) desc limit 30`,
    [releaseKey], "admin");
  console.log(JSON.stringify({mode:"read-only",releaseKey,...totals,topGroups:summary.slice(0,30),conflictExamples,
    externalCalls:{document:0,model:0,embedding:0,search:0,smtp:0}}, null, 2));
} finally { await getPool().end(); }
