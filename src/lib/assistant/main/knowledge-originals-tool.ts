import {z} from 'zod';
import {tenantQuery} from '@/lib/rag/db';
import {result} from './contracts';
import {defineTool} from './tool-definition';

export const knowledgeOriginalsTool=defineTool({id:'knowledge_originals',
  description:'Find an explicitly identified original by title/model or asset ID. Ask for a missing or ambiguous target first; never use the first search hit as the intended model. Access denial and no match are distinct outcomes. No query can expand account permissions.',
  input:z.object({query:z.string().trim().max(180).default(''),assetId:z.uuid().optional()}).strict(),
  execute:async(i,c)=>{
    if(!i.query&&!i.assetId)return result({kind:'clarification',reason:'target-required',
      message:'请提供要打开的型号、资料标题或已获授权的原件；若需要新版，请说明版本或是否查找最新已登记版本。'},
      {status:'missing_input',missing:['Explicit document target'],cost:'known'});
    const rows=await tenantQuery<{id:string;title:string;mime:string;sha256:string}>(c.userId,`
      select a.id,d.title,a.mime_type as mime,a.source_sha256 as sha256
      from knowledge_asset a join knowledge_document d on d.id=a.document_id
      join knowledge_collection k on k.id=d.collection_id
      left join knowledge_tree_version v on v.id=d.current_tree_version_id
      where (d.visibility='shared' or d.owner_id=$1) and d.status='active'
        and a.registration_status='registered' and ($2::uuid is null or a.id=$2)
        and d.title ilike $3 escape E'\\\\'
        and ($4::text[] is null or k.slug=any($4::text[]))
        and (d.current_tree_version_id is null or (v.status='ready' and v.asset_id=a.id and v.source_sha256=a.source_sha256))
      order by a.updated_at desc,a.id limit 21`,
      [c.userId,i.assetId??null,`%${i.query.replace(/[\\%_]/g,'\\$&')}%`,c.knowledgeScope??null]);
    if(!rows.length)return i.assetId
      ?result({kind:'deny',reason:'source-unavailable',message:'该资料无法在当前账号授权范围内读取。不能展示未经授权的其他账号私有内容；请通过正常共享流程取得授权或提供获准共享的副本。'},
        {status:'unavailable',cost:'known'})
      :result({kind:'insufficient-evidence',reason:'no-accessible-match',message:'本次授权范围内未找到匹配原件，请核对完整型号或标题。此结果不代表外部来源不存在该资料。'},
        {status:'partial',cost:'known'});
    const documents=rows.slice(0,20);
    return result({kind:'document-candidates',documents,partial:rows.length>20,requiresSelection:documents.length>1},
      {status:rows.length>20?'partial':'success',artifacts:documents.map(r=>({id:r.id,title:r.title,url:`/api/knowledge/assets/${r.id}`})),cost:'known'});
  }});
