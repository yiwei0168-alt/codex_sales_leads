import { tenantQuery } from "@/lib/rag/db";

export async function linkKnowledgeDocumentEntities(userId:string,documentId:string,entities:Array<{type:"product"|"company"|"industry-topic";key:string;name?:string}>){
  for(const entity of entities){
    const rows=await tenantQuery<{id:string}>(userId,`insert into knowledge_entity(entity_type,canonical_key,display_name) values($1,$2,$3)
      on conflict(entity_type,canonical_key) do update set display_name=excluded.display_name returning id`,[entity.type,entity.key,entity.name??entity.key],"admin");
    await tenantQuery(userId,`insert into knowledge_document_entity(document_id,entity_id) values($1,$2) on conflict do nothing`,[documentId,rows[0].id],"admin");
  }
}

export async function resolveKnowledgeEntities(userId:string,type:string,key:string){
  return tenantQuery<{id:string;canonicalKey:string;displayName:string;documentIds:string[]}>(userId,`select e.id,e.canonical_key as "canonicalKey",e.display_name as "displayName",array_agg(de.document_id order by de.document_id) as "documentIds"
    from knowledge_entity e join knowledge_document_entity de on de.entity_id=e.id join knowledge_document d on d.id=de.document_id
    where e.entity_type=$1 and lower(e.canonical_key)=lower($2) and (d.visibility='shared' or d.owner_id=$3) group by e.id`,[type,key,userId]);
}
