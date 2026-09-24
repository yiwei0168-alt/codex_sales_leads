import type {PoolClient} from "pg";
import {sha256} from "@/lib/rag/chunker";

const EXTRACTOR_VERSION="inline-text-v1";

/** Exact Unicode code point offsets refer to the immutable knowledge_document_revision.content. */
export function textEvidenceRanges(content:string,maxLength=3000){
  const ranges:Array<{start:number;end:number;content:string}>=[];
  let codePointStart=0;
  for(let start=0;start<content.length;){
    let end=Math.min(start+maxLength,content.length);
    if(end<content.length){
      const boundary=content.lastIndexOf("\n",end);
      if(boundary>start+maxLength/2)end=boundary+1;
      else if(end>start&&content.charCodeAt(end-1)>=0xD800&&content.charCodeAt(end-1)<=0xDBFF)end--;
    }
    const piece=content.slice(start,end);
    const codePointEnd=codePointStart+Array.from(piece).length;
    ranges.push({start:codePointStart,end:codePointEnd,content:piece});
    codePointStart=codePointEnd;
    start=end;
  }
  return ranges;
}

/** Called inside the legacy text save transaction so a failed tree cannot replace its old pointer. */
export async function indexTextRevision(client:PoolClient,documentId:string,content:string,contentHash:string,title:string){
  if(sha256(content)!==contentHash)throw new Error("Text revision hash mismatch");
  const revision=await client.query<{id:string}>(`select id from knowledge_document_revision
    where document_id=$1 and content_sha256=$2 and content=$3 and reconstructed=false`,[documentId,contentHash,content]);
  if(!revision.rows[0])throw new Error("Exact text revision required");
  const artifactHash=sha256(`${EXTRACTOR_VERSION}:${contentHash}`);
  const existing=await client.query<{id:string;artifact_sha256:string;status:string}>(`select id,artifact_sha256,status from knowledge_tree_version
    where document_id=$1 and source_sha256=$2 and extractor_version=$3 for update`,[documentId,contentHash,EXTRACTOR_VERSION]);
  if(existing.rows[0]?.artifact_sha256!==undefined&&existing.rows[0].artifact_sha256!==artifactHash)throw new Error("Conflicting text tree artifact");
  if(existing.rows[0]?.status==="ready"){
    await client.query("update knowledge_document set current_tree_version_id=$2 where id=$1",[documentId,existing.rows[0].id]);
    return existing.rows[0].id;
  }
  const version=existing.rows[0]??(await client.query<{id:string}>(`insert into knowledge_tree_version
    (document_id,asset_id,source_sha256,extractor_version,artifact_sha256) values($1,null,$2,$3,$4) returning id`,
    [documentId,contentHash,EXTRACTOR_VERSION,artifactHash])).rows[0];
  await client.query("delete from knowledge_tree_node where version_id=$1",[version.id]);
  const parent=(await client.query<{id:string}>(`insert into knowledge_tree_node
    (version_id,ordinal,node_kind,title,heading_path,unit_type,unit_index,source_location)
    values($1,0,'unit',$2,$3,'document',1,$4) returning id`,
    [version.id,title,[title],JSON.stringify({revisionId:revision.rows[0].id,unitType:"document",unitIndex:1})])).rows[0];
  const ranges=textEvidenceRanges(content);
  if(!ranges.length||ranges.length>1000)throw new Error("Text evidence size out of range");
  for(const [ordinal,range] of ranges.entries()){
    await client.query(`insert into knowledge_tree_node
      (version_id,parent_id,ordinal,node_kind,title,heading_path,unit_type,unit_index,source_location,content,content_sha256)
      values($1,$2,$3,'evidence',$4,$5,'document',1,$6,$7,$8)`,
      [version.id,parent.id,ordinal,`Text ${ordinal+1}`,[title],JSON.stringify({revisionId:revision.rows[0].id,unitType:"document",unitIndex:1,start:range.start,end:range.end}),range.content,sha256(range.content)]);
  }
  await client.query("update knowledge_tree_version set status='ready',ready_at=now(),error_code=null where id=$1",[version.id]);
  await client.query("update knowledge_document set current_tree_version_id=$2 where id=$1",[documentId,version.id]);
  return version.id;
}
