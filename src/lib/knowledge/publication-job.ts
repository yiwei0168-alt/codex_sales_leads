export type BinaryPublicationJob={id:string;status:string;visibility:'private'|'shared';collection_slug:string;title:string;source_url:string|null;entity_key:string|null;
 storage_key:string;extraction_artifact_key:string|null;source_sha256:string;extractor_version:string|null;mime_type:string;byte_size:string;
 metrics:{artifactSha256?:string};revision_target_document_id:string|null;revision_base_version_id:string|null;published_document_id:string|null;published_asset_id:string|null};

export const publicationJobColumns='id,status,visibility,collection_slug,title,source_url,entity_key,storage_key,extraction_artifact_key,source_sha256,extractor_version,mime_type,byte_size::text,metrics,revision_target_document_id,revision_base_version_id,published_document_id,published_asset_id';

/** Status/publication IDs may advance on a successful competing registration.
 * Every input used to prepare publication must still match after the row lock. */
export function samePublicationJobBinding(current:BinaryPublicationJob,observed:BinaryPublicationJob){
 const fields=['id','visibility','collection_slug','title','source_url','entity_key','storage_key','extraction_artifact_key',
  'source_sha256','extractor_version','mime_type','byte_size','revision_target_document_id','revision_base_version_id'] as const;
 return fields.every(key=>current[key]===observed[key])&&current.metrics?.artifactSha256===observed.metrics?.artifactSha256;
}
