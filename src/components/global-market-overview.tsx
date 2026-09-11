"use client";
import { useEffect,useState } from "react";
import type { CompanyRecord } from "@/lib/domain";
import { marketCode,marketHref,marketLabel } from "@/lib/sales/market-navigation";
export function GlobalMarketOverview({companies}:{companies:CompanyRecord[]}){
  const [tasks,setTasks]=useState<Array<{country:string;active:number}>|null>(null);const [error,setError]=useState(false);
  useEffect(()=>{const controller=new AbortController();let pending=false;
    async function read(){if(pending||document.hidden)return;pending=true;try{const response=await fetch("/api/tasks/markets",{signal:controller.signal,cache:"no-store"});if(!response.ok)throw new Error();const data=await response.json();if(!controller.signal.aborted){setTasks(data.markets);setError(false);}}catch{if(!controller.signal.aborted)setError(true);}finally{pending=false;}}
    void read();const timer=window.setInterval(()=>void read(),30000);return()=>{controller.abort();window.clearInterval(timer);};},[]);
  const codes=[...new Set([...companies.map(company=>marketCode(company.country)),...(tasks??[]).map(item=>item.country).filter(code=>code!=="unknown")])].sort();
  const today=new Date().toISOString().slice(0,10);
  return <section className="panel"><h2>已保存市场概览</h2><p>仅统计当前用户数据库记录；不推断市场覆盖率或未搜索地区的机会。</p>
    {error&&<p role="status">运行任务统计读取失败；旧计数暂不显示，稍后自动重试。</p>}
    <div className="table-scroll"><table className="data-table"><thead><tr><th>国家</th><th>候选</th><th>开发名单</th><th>已联系及后续</th><th>到期待跟进</th><th>排队 / 运行任务</th></tr></thead><tbody>{codes.map(code=>{
      const rows=companies.filter(company=>marketCode(company.country)===code);
      return <tr key={code}><td><a href={marketHref(code,"leads")}>{marketLabel(code)}</a></td><td>{rows.length}</td>
        <td>{rows.filter(item=>!["Discovered","Excluded"].includes(item.opportunityStage)).length}</td>
        <td>{rows.filter(item=>["Contacted","Engaged","Cooperating"].includes(item.opportunityStage)||Boolean(item.outreachSummary?.sentCount)).length}</td>
        <td>{rows.filter(item=>item.nextActionDueAt&&item.nextActionDueAt<=today&&!["Closed","Paused","Discovered","Excluded"].includes(item.opportunityStage)).length}</td><td>{error?"不可用":tasks===null?"读取中":tasks.find(item=>item.country===code)?.active??0}</td></tr>;
    })}</tbody></table></div>{!error&&tasks?.some(item=>item.country==="unknown")&&<p>未标注国家 / 混合批次运行任务：{tasks.find(item=>item.country==="unknown")?.active}，请在任务中心查看。</p>}{!codes.length&&<p>暂无已保存候选，可在 AI 助理中确认搜索计划。</p>}
  </section>;
}
