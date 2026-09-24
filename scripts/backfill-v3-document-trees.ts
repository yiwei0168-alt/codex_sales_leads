import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery,tenantTransaction} from "../src/lib/rag/db";
import {assertResolvedInsideKnowledgeRoot,safeKnowledgeStorageKey} from "../src/lib/knowledge/document-repository";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
const apply=process.argv.includes("--apply");
const limitArg=process.argv.find(arg=>arg.startsWith("--limit="));
const limit=Math.min(300,Math.max(1,Number(limitArg?.split("=")[1]??20)));
if(!Number.isInteger(limit))throw new Error("Integer --limit required");
const digest=(value:Uint8Array|string)=>createHash("sha256").update(value).digest("hex");
type Source={documentId:string;assetId:string;revisionId:string;title:string;storageKey:string;byteSize:string;sourceSha256:string;artifactSha256:string;releaseId:string};
type Chunk={id:string;chunk_index:number;unit_type:string;unit_index:number;source_location:Record<string,unknown>;content:string;content_sha256:string};
let built=0,failed=0,skipped=0;
try{
  const sources=await tenantQuery<Source>(OWNER_USER_ID,`select d.id as "documentId",a.id as "assetId",sr.id as "revisionId",d.title,
    a.storage_key as "storageKey",a.byte_size::text as "byteSize",sr.source_sha256 as "sourceSha256",
    sr.artifact_sha256 as "artifactSha256",sr.release_id as "releaseId"
    from knowledge_release_pointer_v3 p join knowledge_source_revision_v3 sr on sr.release_id=p.release_id
    join knowledge_asset a on a.id=sr.asset_id join knowledge_document d on d.id=a.document_id
    where p.scope_kind='shared' and d.visibility='shared' and d.status='active' and a.registration_status='registered'
      and sr.source_sha256=a.source_sha256 and d.current_tree_version_id is null
    order by d.id limit $1`,[limit],"admin");
  if(apply)for(const source of sources){
    try{
      const path=resolve(safeKnowledgeStorageKey(source.storageKey));assertResolvedInsideKnowledgeRoot(path);
      const sourceBytes=await readFile(path);
      if(sourceBytes.length!==Number(source.byteSize)||digest(sourceBytes)!==source.sourceSha256)throw new Error("Source bytes differ from registered hash");
      const artifactBytes=await readFile(resolve("tmp","rag-v3-full",`${source.sourceSha256}.json`));
      if(digest(artifactBytes)!==source.artifactSha256)throw new Error("Extraction artifact differs from active release");
      const artifact=JSON.parse(artifactBytes.toString("utf8")) as {sourceSha256?:string;extractorVersion?:string};
      if(artifact.sourceSha256!==source.sourceSha256||artifact.extractorVersion!=="docling-v3.0.3")throw new Error("Extraction identity mismatch");
      const chunks=await tenantQuery<Chunk>(OWNER_USER_ID,`select c.id,c.chunk_index,u.unit_type,u.unit_index,c.source_location,c.content,c.content_sha256
        from knowledge_chunk_v3 c join knowledge_source_unit_v3 u on u.id=c.source_unit_id
        where c.source_revision_id=$1 and c.release_id=$2 and c.document_id=$3
          and u.status in('success','review-required') order by c.chunk_index`,
        [source.revisionId,source.releaseId,source.documentId],"admin");
      if(!chunks.length){skipped++;continue;}
      if(chunks.some(chunk=>digest(chunk.content)!==chunk.content_sha256||
        chunk.source_location.unitType!==chunk.unit_type||chunk.source_location.unitIndex!==chunk.unit_index))throw new Error("Release chunk coordinates or hash mismatch");
      await tenantTransaction(OWNER_USER_ID,async client=>{
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[source.documentId]);
        const current=await client.query<{id:string}>(`select d.id from knowledge_document d join knowledge_asset a on a.document_id=d.id
          join knowledge_source_revision_v3 sr on sr.asset_id=a.id
          join knowledge_release_pointer_v3 p on p.release_id=sr.release_id and p.scope_kind='shared'
          where d.id=$1 and d.current_tree_version_id is null and d.status='active' and d.visibility='shared'
            and a.id=$2 and a.registration_status='registered' and a.source_sha256=$3
            and sr.id=$4 and sr.artifact_sha256=$5 for update of d`,
          [source.documentId,source.assetId,source.sourceSha256,source.revisionId,source.artifactSha256]);
        if(!current.rows[0])throw new Error("Registered release source changed");
        const prior=await client.query<{id:string;artifact_sha256:string}>(`select id,artifact_sha256 from knowledge_tree_version
          where document_id=$1 and source_sha256=$2 and extractor_version='docling-v3.0.3-release-tree-v1' for update`,
          [source.documentId,source.sourceSha256]);
        if(prior.rows[0]&&prior.rows[0].artifact_sha256!==source.artifactSha256)throw new Error("Conflicting extraction artifact for source");
        const version=prior.rows[0]??(await client.query<{id:string}>(`insert into knowledge_tree_version
          (document_id,asset_id,source_sha256,extractor_version,artifact_sha256)
          values($1,$2,$3,'docling-v3.0.3-release-tree-v1',$4) returning id`,
          [source.documentId,source.assetId,source.sourceSha256,source.artifactSha256])).rows[0];
        await client.query("delete from knowledge_tree_node where version_id=$1",[version.id]);
        const parents=new Map<string,string>();
        for(const [ordinal,unit] of [...new Map(chunks.map(chunk=>[`${chunk.unit_type}:${chunk.unit_index}`,chunk])).values()].entries()){
          const title=`${unit.unit_type} ${unit.unit_index}`;
          const row=(await client.query<{id:string}>(`insert into knowledge_tree_node
            (version_id,ordinal,node_kind,title,heading_path,unit_type,unit_index,source_location)
            values($1,$2,'unit',$3,$4,$5,$6,$7) returning id`,
            [version.id,ordinal,title,[title],unit.unit_type,unit.unit_index,JSON.stringify({unitType:unit.unit_type,unitIndex:unit.unit_index})])).rows[0];
          parents.set(`${unit.unit_type}:${unit.unit_index}`,row.id);
        }
        for(const [ordinal,chunk] of chunks.entries()){
          const parent=parents.get(`${chunk.unit_type}:${chunk.unit_index}`);
          if(!parent)throw new Error("Missing unit parent");
          await client.query(`insert into knowledge_tree_node
            (version_id,parent_id,ordinal,node_kind,title,heading_path,unit_type,unit_index,source_location,content,content_sha256)
            values($1,$2,$3,'evidence',$4,$5,$6,$7,$8,$9,$10)`,
            [version.id,parent,ordinal,`Extracted block ${chunk.chunk_index+1}`,[`${chunk.unit_type} ${chunk.unit_index}`],chunk.unit_type,chunk.unit_index,
              JSON.stringify({...chunk.source_location,v3ChunkId:chunk.id,extractorVersion:"docling-v3.0.3"}),chunk.content,chunk.content_sha256]);
        }
        const count=(await client.query<{count:string}>("select count(*)::text count from knowledge_tree_node where version_id=$1",[version.id])).rows[0];
        if(Number(count.count)!==chunks.length+parents.size)throw new Error("Tree node count mismatch");
        await client.query("update knowledge_tree_version set status='ready',ready_at=now() where id=$1",[version.id]);
        await client.query("update knowledge_document set current_tree_version_id=$2 where id=$1",[source.documentId,version.id]);
      },"admin");
      built++;
    }catch(error){failed++;console.error(JSON.stringify({documentId:source.documentId,error:error instanceof Error?error.message:"unknown"}));}
  }
  console.log(JSON.stringify({local:true,mode:apply?"apply":"dry-run",eligible:sources.length,built,skipped,failed,limit,externalCalls:0}));
  if(failed)process.exitCode=1;
}finally{await getPool().end();}
