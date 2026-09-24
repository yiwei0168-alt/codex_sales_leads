import {tenantQuery} from "@/lib/rag/db";

export type LibraryScope="all"|"private"|"shared"|"evidence";
/** Read the complete saved text with the same ownership boundary as the list. */
export async function readKnowledgeLibraryItem(userId:string,id:string,scope:LibraryScope){
  if(scope==="all")throw new Error("读取资料时必须指定来源范围");
  const rows=scope==="evidence"?await tenantQuery(userId,`select d.id,d.title,
    (select string_agg(content,E'\n\n' order by chunk_index) from public_evidence.chunk where document_version_id=d.id) as content
    from public_evidence.document_version d join public_evidence.source s on s.id=d.source_id
    where d.id=$1 and s.sharing_status='public' and d.freshness_status<>'invalid'`,[id])
    :await tenantQuery(userId,`select d.id,d.title,
      (select string_agg(content,E'\n\n' order by chunk_index) from knowledge_chunk where document_id=d.id) as content
      from knowledge_document d where d.id=$1 and d.visibility=$2 and ($2='shared' or d.owner_id=$3)`,[id,scope,userId]);
  return rows[0]??null;
}
export async function listKnowledgeLibrary(userId:string,scope:LibraryScope,query:string,offset:number,limit=50){
  const pageSize=Math.min(Math.max(limit,1),50);
  const treeReady=`d.status='active' and v.status='ready' and (va.id is not null or (v.asset_id is null and d.content_sha256=v.source_sha256
    and exists(select 1 from knowledge_document_revision r where r.document_id=d.id and r.content_sha256=v.source_sha256 and not r.reconstructed)))`;
  if(scope==="all"){
    const rows=await tenantQuery(userId,`with records as (
      select d.id,d.title,d.source_url as "sourceUrl",d.updated_at::text as "updatedAt",d.updated_at as sort_time,
        d.status::text as status,d.visibility::text as scope,left(k.content,1500) as excerpt,a.id as "assetId",
        a.document_type as "documentType",a.document_version as version,d.current_tree_version_id as "treeVersionId",
        v.source_sha256 as "sourceSha256",case when ${treeReady} then 'searchable' when v.id is null then 'pending' else 'unavailable' end as "treeStatus"
      from knowledge_document d
      left join knowledge_tree_version v on v.id=d.current_tree_version_id
      left join knowledge_asset va on va.id=v.asset_id and va.document_id=d.id and va.registration_status='registered' and va.source_sha256=v.source_sha256
      left join lateral(select content from knowledge_chunk where document_id=d.id order by chunk_index limit 1) k on true
      left join lateral(select id,document_type,document_version from knowledge_asset where document_id=d.id and registration_status='registered' order by updated_at desc,id limit 1) a on true
      where (d.visibility='shared' or (d.visibility='private' and d.owner_id=$1))
        and ($2='' or d.title ilike '%'||$2||'%' or d.source_url ilike '%'||$2||'%')
      union all
      select d.id,d.title,s.canonical_url as "sourceUrl",d.last_verified_at::text as "updatedAt",d.last_verified_at as sort_time,
        d.freshness_status::text as status,'public-evidence'::text as scope,left(c.content,1500) as excerpt,
        null::uuid as "assetId",null::text as "documentType",null::text as version,null::uuid as "treeVersionId",
        null::text as "sourceSha256",null::text as "treeStatus"
      from public_evidence.document_version d join public_evidence.source s on s.id=d.source_id
      left join lateral(select content from public_evidence.chunk where document_version_id=d.id order by chunk_index limit 1)c on true
      where s.sharing_status='public' and d.freshness_status<>'invalid'
        and ($2='' or d.title ilike '%'||$2||'%' or s.canonical_url ilike '%'||$2||'%')
    ) select id,title,"sourceUrl","updatedAt",status,scope,excerpt,"assetId","documentType",version,"treeVersionId","sourceSha256","treeStatus"
      from records order by sort_time desc nulls last,id limit $3 offset $4`,[userId,query,pageSize+1,offset]);
    return {items:rows.slice(0,pageSize),hasMore:rows.length>pageSize,fetched:rows.length};
  }
  const rows=scope==="evidence"?await tenantQuery(userId,`select d.id,d.title,s.canonical_url as "sourceUrl",d.last_verified_at::text as "updatedAt",d.freshness_status as status,'public-evidence' as scope,
      left(c.content,1500) as excerpt from public_evidence.document_version d join public_evidence.source s on s.id=d.source_id
      left join lateral(select content from public_evidence.chunk where document_version_id=d.id order by chunk_index limit 1)c on true
      where s.sharing_status='public' and d.freshness_status<>'invalid' and ($1='' or d.title ilike '%'||$1||'%' or s.canonical_url ilike '%'||$1||'%')
      order by d.last_verified_at desc,d.id limit $3 offset $2`,[query,offset,pageSize+1]):await tenantQuery(userId,`select d.id,d.title,d.source_url as "sourceUrl",d.updated_at::text as "updatedAt",d.status,d.visibility as scope,d.content_sha256 as hash,c.slug as collection,
      left(k.content,1500) as excerpt,a.id as "assetId",a.document_type as "documentType",a.document_version as version,
      d.current_tree_version_id as "treeVersionId",v.source_sha256 as "sourceSha256",
      case when ${treeReady} then 'searchable' when v.id is null then 'pending' else 'unavailable' end as "treeStatus"
      from knowledge_document d join knowledge_collection c on c.id=d.collection_id
      left join knowledge_tree_version v on v.id=d.current_tree_version_id
      left join knowledge_asset va on va.id=v.asset_id and va.document_id=d.id and va.registration_status='registered' and va.source_sha256=v.source_sha256
      left join lateral(select content from knowledge_chunk where document_id=d.id order by chunk_index limit 1) k on true
      left join lateral(select id,document_type,document_version from knowledge_asset where document_id=d.id and registration_status='registered' order by updated_at desc,id limit 1) a on true
      where d.visibility=$2 and ($2='shared' or d.owner_id=$1) and ($3='' or d.title ilike '%'||$3||'%') order by d.updated_at desc,d.id limit $5 offset $4`,[userId,scope,query,offset,pageSize+1]);
  return {items:rows.slice(0,pageSize),hasMore:rows.length>pageSize,fetched:rows.length};
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
