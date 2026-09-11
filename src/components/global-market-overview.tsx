"use client";
import type { CompanyRecord } from "@/lib/domain";
import { marketCode,marketHref,marketLabel } from "@/lib/sales/market-navigation";
export function GlobalMarketOverview({companies}:{companies:CompanyRecord[]}){
  const codes=[...new Set(companies.map(company=>marketCode(company.country)))].sort();
  const today=new Date().toISOString().slice(0,10);
  return <section className="panel"><h2>已保存市场概览</h2><p>仅统计当前用户数据库记录；不推断市场覆盖率或未搜索地区的机会。</p>
    <div className="table-scroll"><table className="data-table"><thead><tr><th>国家</th><th>候选</th><th>开发名单</th><th>已联系及后续</th><th>到期待跟进</th></tr></thead><tbody>{codes.map(code=>{
      const rows=companies.filter(company=>marketCode(company.country)===code);
      return <tr key={code}><td><a href={marketHref(code,"leads")}>{marketLabel(code)}</a></td><td>{rows.length}</td>
        <td>{rows.filter(item=>!["Discovered","Excluded"].includes(item.opportunityStage)).length}</td>
        <td>{rows.filter(item=>["Contacted","Engaged","Cooperating"].includes(item.opportunityStage)||Boolean(item.outreachSummary?.sentCount)).length}</td>
        <td>{rows.filter(item=>item.nextActionDueAt&&item.nextActionDueAt<=today&&!["Closed","Paused","Discovered","Excluded"].includes(item.opportunityStage)).length}</td></tr>;
    })}</tbody></table></div>{!codes.length&&<p>暂无已保存候选，可在 AI 助理中确认搜索计划。</p>}
  </section>;
}
