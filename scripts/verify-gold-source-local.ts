import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {listGoldSourceEvidence} from "../src/lib/knowledge/gold-source";

nextEnv.loadEnvConfig(process.cwd());
try{
  const [sample]=await tenantQuery<{sha:string;unitIndex:number;blockId:string;content:string}>(OWNER_USER_ID,`
    select a.source_sha256 as sha,n.unit_index as "unitIndex",n.source_location->>'blockId' as "blockId",n.content
    from knowledge_release_pointer_v3 p join knowledge_chunk_v3 c on c.release_id=p.release_id
    join knowledge_source_revision_v3 sr on sr.id=c.source_revision_id
    join knowledge_asset a on a.id=sr.asset_id join knowledge_document d on d.id=a.document_id
    join knowledge_tree_version v on v.id=d.current_tree_version_id and v.asset_id=a.id and v.status='ready'
    join knowledge_tree_node n on n.version_id=v.id and n.node_kind='evidence'
    where p.scope_kind='shared' and d.status='active' and d.visibility='shared'
      and a.registration_status='registered' and length(n.content)>20 limit 1`,[],"admin");
  if(!sample)throw new Error("No active shared Gold source tree sample");
  const blocks=await listGoldSourceEvidence(OWNER_USER_ID,sample.sha,sample.unitIndex);
  if(!blocks.some(block=>block.blockId===sample.blockId&&block.content===sample.content))
    throw new Error("Gold source preview omitted the current evidence block");
  console.log(JSON.stringify({ok:true,unitIndex:sample.unitIndex,blocks:blocks.length,matched:true}));
}finally{await getPool().end();}
