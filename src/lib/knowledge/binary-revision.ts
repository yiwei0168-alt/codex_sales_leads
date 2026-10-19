import {extname} from 'node:path';
import {tenantTransaction} from '@/lib/rag/db';
import {writeExtractedTree,type Block} from './extracted-tree';
import {inspectKnowledgeAssetBytes} from './document-repository';
import {revalidateReviewedExtraction} from './reviewed-extraction';
import {assertCurrentKnowledgePublisher} from './publication-authorization';
import {assertCurrentUploadLease} from './publication-lease';

export type BinaryRevisionJob={id:string;status:string;visibility:'private'|'shared';collection_slug:string;title:string;source_url:string|null;entity_key:string|null;
 storage_key:string;extraction_artifact_key:string|null;source_sha256:string;extractor_version:string|null;mime_type:string;byte_size:string;
 metrics:{artifactSha256?:string};revision_target_document_id:string|null;revision_base_version_id:string|null;published_document_id:string|null;published_asset_id:string|null};
class BinaryRevisionError extends Error{constructor(code:string,message:string){super(message);this.name=code;}}

/** Original bytes and extraction identity are checked by registerVectorlessUpload before entry.
 * Everything newly visible (revision, asset, tree, metadata, pointer) commits together. */
export async function registerBinaryRevision(userId:string,job:BinaryRevisionJob,input:{blocks:Block[];content:string;contentHash:string;artifactBytes:Uint8Array;language:string;authorityLevel:number;leaseToken?:string},role:'admin'|'member'){
 return tenantTransaction(userId,async client=>{
  const locked=await client.query<BinaryRevisionJob&{lease_token:string|null;lease_valid:boolean}>(`select *,lease_until>clock_timestamp() as lease_valid
    from knowledge_upload_job where id=$1 and user_id=$2 for update`,[job.id,userId]);
  const current=locked.rows[0];
  if(!current||!['extracted','registered'].includes(current.status)||current.source_sha256!==job.source_sha256||current.extractor_version!==job.extractor_version
    ||current.extraction_artifact_key!==job.extraction_artifact_key||current.metrics.artifactSha256!==job.metrics.artifactSha256
    ||current.revision_target_document_id!==job.revision_target_document_id||current.revision_base_version_id!==job.revision_base_version_id
    ||current.visibility!==job.visibility||current.storage_key!==job.storage_key||current.byte_size!==job.byte_size)throw new Error('Revision job changed during registration');
  if(input.leaseToken&&(current.lease_token!==input.leaseToken||!current.lease_valid))throw new Error('Upload lease expired or changed');
  await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[job.revision_target_document_id]);
  const selected=await client.query<{id:string;current_tree_version_id:string;source_sha256:string;asset_id:string}>(`select d.id,d.current_tree_version_id,v.source_sha256,v.asset_id
    from knowledge_document d join knowledge_collection c on c.id=d.collection_id
    join knowledge_tree_version v on v.id=d.current_tree_version_id and v.status='ready'
    join knowledge_asset a on a.id=v.asset_id and a.registration_status='registered' and a.source_sha256=v.source_sha256
    join app_user u on u.id=$2 and u.status='active'
    where d.id=$1 and d.owner_id=$2 and d.status='active' and d.visibility=$3 and c.slug=$4
      and d.metadata->>'sourceSha256'=v.source_sha256 and (c.slug<>'product' or d.product_id is not distinct from $5::text)
      and ($3='private' or u.role='admin') for update of d`,[job.revision_target_document_id,userId,job.visibility,job.collection_slug,job.entity_key]);
  const target=selected.rows[0];if(!target)throw new BinaryRevisionError('revision-source-unavailable','Active owned binary revision target required');
  if(current.status==='registered'){
    if(target.source_sha256!==job.source_sha256||target.id!==current.published_document_id||target.asset_id!==current.published_asset_id)
      throw new Error('Revision is no longer current; refusing to restore an old version');
    await assertCurrentKnowledgePublisher(client,userId,job.visibility);
    await assertCurrentUploadLease(client,userId,job.id,input.leaseToken);
    return {documentId:target.id,assetId:target.asset_id,versionId:target.current_tree_version_id,reused:true,treeStatus:'searchable' as const};
  }
  if(target.current_tree_version_id!==job.revision_base_version_id)throw new BinaryRevisionError('revision-conflict','Document version changed; revision conflict');
  const asset=(await client.query<{id:string}>(`insert into knowledge_asset
    (document_id,storage_key,source_sha256,mime_type,byte_size,document_type,language,source_nature,externally_disclosable)
    values($1,$2,$3,$4,$5,$6,$7,$8,false) returning id`,[target.id,job.storage_key,job.source_sha256,job.mime_type,Number(job.byte_size),
      extname(job.storage_key).slice(1).toUpperCase(),input.language,job.visibility==='shared'?'admin-uploaded-binary':'private-uploaded-binary'])).rows[0];
  const tree=await writeExtractedTree(client,{documentId:target.id,assetId:asset.id,sourceSha256:job.source_sha256,
    extractorVersion:job.extractor_version!,artifactHash:job.metrics.artifactSha256!,blocks:input.blocks});
  // A pre-existing historical tree cannot be silently rebound to a new original.
  if(tree.reused)throw new Error('Historical content already has a version; explicit history restoration required');
  await client.query(`insert into knowledge_document_revision(document_id,user_id,content_sha256,title,content,reconstructed)
    values($1,$2,$3,$4,$5,false) on conflict(document_id,content_sha256) do nothing`,[target.id,userId,input.contentHash,job.title,input.content]);
  await client.query(`update knowledge_document set current_tree_version_id=$2,title=$3,source_url=$4,content_sha256=$5,
    language=$6,authority_level=$7,metadata=metadata||$8::jsonb,updated_at=now() where id=$1`,[target.id,tree.versionId,job.title,job.source_url,input.contentHash,input.language,input.authorityLevel,
      JSON.stringify({uploadJobId:job.id,sourceSha256:job.source_sha256,extractorArtifactSha256:job.metrics.artifactSha256})]);
  await client.query(`update knowledge_upload_job set status='registered',published_document_id=$2,published_asset_id=$3,error_code=null,updated_at=now() where id=$1`,[job.id,target.id,asset.id]);
  const finalSource=await inspectKnowledgeAssetBytes(job.storage_key,job.source_sha256);
  if(finalSource.byteSize!==Number(job.byte_size))throw new Error('Source bytes changed during revision registration');
  await inspectKnowledgeAssetBytes(job.extraction_artifact_key!,job.metrics.artifactSha256!);
  await revalidateReviewedExtraction(client,userId,job.id,input.artifactBytes);
  await assertCurrentKnowledgePublisher(client,userId,job.visibility);
  await assertCurrentUploadLease(client,userId,job.id,input.leaseToken);
  return {documentId:target.id,assetId:asset.id,versionId:tree.versionId,reused:false,treeStatus:'searchable' as const};
 },role);
}
