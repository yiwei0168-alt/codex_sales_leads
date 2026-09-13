import type {CompanyCostSummary as Row} from "@/lib/billing/company-cost-summary";
const labels={reservation:"历史预留",occupied:"当前占用",estimate:"估算（非账单）","provider-report":"服务商报告",invoice:"核验账单"};
const companyCostBases=Object.keys(labels) as Array<keyof typeof labels>;
export function CompanyCostSummary({rows}:{rows:Row[]|undefined}){
  return <details><summary>按公司分摊费用</summary>
    <p>各费用口径独立，不能相加。金额显示已知部分及记录覆盖率；没有记录不等于零。共同费用在任务完成后按实际处理公司等分，包含未合格公司。</p>
    {!rows?.length&&<p>暂无可展示的公司费用记录。</p>}
    {rows?.map((row,index)=><section key={row.companyKey??"unallocated"}>
      <h4>{row.companyKey===null?"未分配任务费用":row.domain??`公司 ${index+1}（身份名称未关联）`}{row.countryCode?` · ${row.countryCode}`:""}</h4>
      <dl>{companyCostBases.map(basis=><div key={basis}><dt>{labels[basis]}</dt><dd>
        {row.costs[basis].amountMicros===null?"未知":`$${(row.costs[basis].amountMicros/1e6).toFixed(6)}`}
        {` · ${row.costs[basis].knownCalls}/${row.costs[basis].calls} 次有记录`}
      </dd></div>)}</dl>
    </section>)}
  </details>;
}
