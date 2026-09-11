export type TaskKind="search"|"contacts"|"draft"|"send"|"relationship";
export interface TaskFeedItem {id:string;kind:TaskKind;status:string;country:string|null;title:string;createdAt:string;updatedAt:string;metrics:Record<string,unknown>}
export const taskKindLabels:Record<TaskKind,string>={search:"线索搜索",contacts:"联系人补充",draft:"策略与邮件草稿",send:"邮件发送",relationship:"关系分析"};
export function feedStatus(item:Pick<TaskFeedItem,"kind"|"status">){
  if(item.kind==="draft")return ({generated:"已生成（未发送）",approved:"已批准（非发送凭证）",sent:"草稿标记已发送（以发送记录为准）",cancelled:"已取消"} as Record<string,string>)[item.status]??item.status;
  if(item.kind==="send")return ({sending:"发送处理中，请勿重复发送",sent:"发信服务器已接受",failed:"发送失败",unknown:"发送结果不明，需核实"} as Record<string,string>)[item.status]??item.status;
  return ({proposed:"待确认",confirmed:"已排队",running:"运行中",completed:"运行结束",failed:"失败",cancelled:"已取消"} as Record<string,string>)[item.status]??item.status;
}
export const taskFeedSql=`with feed as (
 select a.id,'search'::text as kind,a.status,upper(a.payload->>'countryCode') as country,
   coalesce(a.payload->>'countryName','未知国家')||' · 线索搜索' as title,a.created_at,a.updated_at,
   jsonb_build_object('target',a.payload->'targetCount','saved',a.result->'accepted','credits',a.result->'creditsUsed') as metrics
 from assistant_action a where a.user_id=$1
 union all
 select r.id,'contacts',r.status,upper(r.metadata->>'countryCode'),'联系人补充批次',r.started_at,coalesce(r.finished_at,r.started_at),
   jsonb_build_object('target',r.target_count,'processed',r.processed_count,'credits',r.search_credits_used+r.extract_credits_used)
 from company_enrichment_run r join market_workspace w on w.id=r.workspace_id where w.owner_id=$1
 union all
 select d.id,'draft',d.status,upper(c.country_code),coalesce(wc.user_overrides->>'displayName',c.canonical_name)||' · 开发草稿',d.created_at,d.updated_at,
   jsonb_build_object('revision',d.revision,'model',d.model,'promptTokens',d.generation_metrics->'promptTokens','completionTokens',d.generation_metrics->'completionTokens')
 from outreach_draft d join sales_company c on c.id=d.company_id
 join workspace_company wc on wc.workspace_id=d.workspace_id and wc.company_id=d.company_id
 join market_workspace w on w.id=d.workspace_id where d.user_id=$1 and w.owner_id=$1
 union all
 select m.id,'send',m.status,upper(c.country_code),coalesce(wc.user_overrides->>'displayName',c.canonical_name)||' · 邮件发送',m.created_at,coalesce(m.sent_at,m.created_at),
   jsonb_build_object('sentAt',m.sent_at,'followUp',m.parent_id is not null)
 from outbound_mail m join sales_company c on c.id=m.company_id
 join workspace_company wc on wc.workspace_id=m.workspace_id and wc.company_id=m.company_id
 join market_workspace w on w.id=m.workspace_id where m.user_id=$1 and w.owner_id=$1
 union all
 select r.id,'relationship',r.status,r.country_code,f.canonical_name||' → '||t.canonical_name||' · 关系分析',r.created_at,r.updated_at,r.metrics
 from user_relationship_analysis r join sales_company f on f.id=r.from_company_id join sales_company t on t.id=r.to_company_id
 join market_workspace w on w.id=r.workspace_id where r.user_id=$1 and w.owner_id=$1
 ) select id,kind,status,country,title,created_at::text as "createdAt",updated_at::text as "updatedAt",metrics
 from feed where ($2='all' or kind=$2) and ($3='all' or country=$3 or ($3='unknown' and country is null))
 and ($4='all' or ($4='active' and status in ('running','confirmed','sending'))
   or ($4='attention' and status in ('proposed','failed','unknown'))
   or ($4='finished' and status in ('completed','generated','approved','sent','cancelled')))
 order by created_at desc,kind,id desc limit 51 offset $5`;
