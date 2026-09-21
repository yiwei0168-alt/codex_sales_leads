import {tenantQuery} from "@/lib/rag/db";

export type LibraryScope="private"|"shared"|"evidence";
/** Read the complete saved text with the same ownership boundary as the list. */
export async function readKnowledgeLibraryItem(userId:string,id:string,scope:LibraryScope){
  const rows=scope==="evidence"?await tenantQuery(userId,`select d.id,d.title,
    (select string_agg(content,E'\n\n' order by chunk_index) from public_evidence.chunk where document_version_id=d.id) as content
    from public_evidence.document_version d join public_evidence.source s on s.id=d.source_id
    where d.id=$1 and s.sharing_status='public' and d.freshness_status<>'invalid'`,[id])
    :await tenantQuery(userId,`select d.id,d.title,
      (select string_agg(content,E'\n\n' order by chunk_index) from knowledge_chunk where document_id=d.id) as content
      from knowledge_document d where d.id=$1 and d.visibility=$2 and ($2='shared' or d.owner_id=$3)`,[id,scope,userId]);
  return rows[0]??null;
}
export async function listKnowledgeLibrary(userId:string,scope:LibraryScope,query:string,offset:number){
  const rows=scope==="evidence"?await tenantQuery(userId,`select d.id,d.title,s.canonical_url as "sourceUrl",d.last_verified_at::text as "updatedAt",d.freshness_status as status,'public-evidence' as scope,
      left(c.content,1500) as excerpt from public_evidence.document_version d join public_evidence.source s on s.id=d.source_id
      left join lateral(select content from public_evidence.chunk where document_version_id=d.id order by chunk_index limit 1)c on true
      where s.sharing_status='public' and d.freshness_status<>'invalid' and ($1='' or d.title ilike '%'||$1||'%' or s.canonical_url ilike '%'||$1||'%')
      order by d.last_verified_at desc,d.id limit 51 offset $2`,[query,offset]):await tenantQuery(userId,`select d.id,d.title,d.source_url as "sourceUrl",d.updated_at::text as "updatedAt",d.status,d.visibility as scope,d.content_sha256 as hash,c.slug as collection,
      left(k.content,1500) as excerpt,a.id as "assetId",a.document_type as "documentType",a.document_version as version from knowledge_document d join knowledge_collection c on c.id=d.collection_id
      left join lateral(select content from knowledge_chunk where document_id=d.id order by chunk_index limit 1) k on true
      left join lateral(select id,document_type,document_version from knowledge_asset where document_id=d.id and registration_status='registered' order by updated_at desc,id limit 1) a on true
      where d.visibility=$2 and ($2='shared' or d.owner_id=$1) and ($3='' or d.title ilike '%'||$3||'%') order by d.updated_at desc,d.id limit 51 offset $4`,[userId,scope,query,offset]);
  return {items:rows.slice(0,50),hasMore:rows.length>50,fetched:rows.length};
}

export async function listKnowledgeRevisions(userId:string,documentId:string,offset:number){
  const rows=await tenantQuery(userId,`select id,title,content_sha256 as hash,left(content,5000) as content,
    length(content)>5000 as truncated,reconstructed,created_at::text as time
    from knowledge_document_revision where user_id=$1 and document_id=$2 order by created_at desc,id desc limit 11 offset $3`,[userId,documentId,offset]);
  return {items:rows.slice(0,10),hasMore:rows.length>10,fetched:rows.length};
}

/** The Agent supplies an observed hash; the page's legacy confirmation may omit it. */
export async function deletePrivateKnowledgeDocument(userId:string,id:string,expectedHash?:string){
  const rows=await tenantQuery(userId,`delete from knowledge_document where id=$1 and owner_id=$2
    and visibility='private' and ($3::text is null or content_sha256=$3) returning id`,[id,userId,expectedHash??null]);
  return rows.length===1;
}
