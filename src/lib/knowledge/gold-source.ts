import {tenantQuery} from "@/lib/rag/db";

export type GoldSourceEvidence={blockId:string;content:string;unitIndex:number};
export const normalizeGoldExcerpt=(value:string)=>value.replace(/\s+/g," ").trim();

export async function listGoldSourceEvidence(userId:string,assetSha256:string,unitIndex:number):Promise<GoldSourceEvidence[]>{
  return tenantQuery<GoldSourceEvidence>(userId,`select n.source_location->>'blockId' as "blockId",n.content,n.unit_index as "unitIndex"
    from knowledge_release_pointer_v3 p join knowledge_chunk_v3 c on c.release_id=p.release_id
    join knowledge_source_revision_v3 sr on sr.id=c.source_revision_id
    join knowledge_asset a on a.id=sr.asset_id join knowledge_document d on d.id=a.document_id
    join knowledge_tree_version v on v.id=d.current_tree_version_id and v.asset_id=a.id and v.source_sha256=a.source_sha256 and v.status='ready'
    join knowledge_tree_node n on n.version_id=v.id and n.node_kind='evidence'
    where p.scope_kind='shared' and a.source_sha256=$1 and n.unit_index=$2
      and a.registration_status='registered' and d.status='active' and d.visibility='shared'
    group by n.id order by n.ordinal limit 1000`,[assetSha256,unitIndex],"admin");
}
