import type {ProviderUsageSummary as Summary} from "@/lib/billing/usage-summary-types";

export function ProviderUsageSummary({groups}:{groups:Summary[]|undefined}){
  return <details><summary>模型用量与缓存观测</summary>
    <p>按服务商原始字段分别统计；已报告合计不代表所有尝试总量。覆盖不足时不计算缓存命中率；不同协议字段不相加，缓存数量不等于实际节省费用。</p>
    {!groups?.length?<p>暂无可用观测记录，不能推断用量或费用为零。</p>:groups.map((group,index)=><details key={index}>
      <summary>{group.stage} · {group.provider??"服务商未记录"} · 请求 {group.requestedModel??"未知模型"} · {group.attempts} 次尝试</summary>
      <p>响应模型：{group.reportedModel??"未报告"}；提示版本：{group.promptVersion??"未记录"}；网关：{group.gatewayHost??"未记录"}；协议：{group.endpointKind??"未记录"}</p>
      <p>评分版本：{group.scoringVersion??"未记录/不适用"}；结束原因：{group.finishReason??"未报告"}</p>
      <p>输入缓存命中率：{group.cacheInputHitRate==null?"不可计算（字段覆盖或协议口径不足）":`${(group.cacheInputHitRate*100).toFixed(2)}%（本组全部尝试有同口径数据）`}</p>
      <ul>{group.fields.filter(field=>field.reportedAttempts>0).map(field=><li key={field.field}>
        {field.field}：已报告 {field.total??"未知"} tokens；覆盖 {field.reportedAttempts}/{group.attempts} 次
      </li>)}</ul>
      {group.fields.every(field=>field.reportedAttempts===0)&&<p>所有用量字段均未报告；保留预算占用。</p>}
      <p>未列出的字段为未知；HTTP 响应或返回结果不等于下游已采用。本地结果复用不计作服务商缓存折价。</p>
    </details>)}
  </details>;
}
