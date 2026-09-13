"use client";
import {useEffect,useState} from "react";
import {ProviderUsageSummary} from "./provider-usage-summary";
import {CostStageSummary} from "./cost-stage-summary";
import {CompanyCostSummary} from "./company-cost-summary";
import type {CompanyCostSummary as CompanyCostRow} from "@/lib/billing/company-cost-summary";
import type {CostStageSummary as CostStage} from "@/lib/billing/cost-summary";
import type {ProviderUsageSummary as UsageSummary} from "@/lib/billing/usage-summary-types";
type Snapshot={companyCosts?:CompanyCostRow[];modelUsage?:UsageSummary[];taskLimit:{limit_micros:string;occupied_micros:string}|null;inheritedTaskLimits?:{action_id:string;limit_micros:string;occupied_micros:string}[];stages:CostStage[]};
const money=(value:string|null)=>value===null?"未报告":`$${(Number(value)/1e6).toFixed(6)}`;
export function TaskSpendBudget({actionId}:{actionId:string}){
  const [open,setOpen]=useState(false),[revision,setRevision]=useState(0),[snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [amount,setAmount]=useState(""),[error,setError]=useState(""),[saving,setSaving]=useState(false);
  useEffect(()=>{if(!open)return;const controller=new AbortController();
    fetch(`/api/budget?actionId=${encodeURIComponent(actionId)}`,{cache:"no-store",signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error("任务预算读取失败，未知金额不是零");return response.json();})
      .then(data=>{if(!controller.signal.aborted){setSnapshot(data);setError("");}})
      .catch(error=>{if(!controller.signal.aborted)setError(error instanceof Error?error.message:"读取失败");});
    return()=>controller.abort();
  },[open,actionId,revision]);
  async function save(event:React.FormEvent){event.preventDefault();if(!window.confirm(`将此任务累计预算设为 ${amount} 美元？用户总预算仍同时生效，历史预留不清零，不会启动任务。`))return;
    setSaving(true);setError("");try{const response=await fetch("/api/budget",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({actionId,limitUsd:amount,confirmed:true})});const data=await response.json();if(!response.ok)throw new Error(data.error);setRevision(value=>value+1);}catch(error){setError(error instanceof Error?error.message:"保存失败");}finally{setSaving(false);}
  }
  return <details onToggle={event=>setOpen(event.currentTarget.open)}><summary>任务预算与成本</summary>{open&&<>
    <p>可选任务上限与用户总预算同时生效；未设置任务上限时沿用总预算。续搜是独立任务，不重置原任务账单。费用上界未审核时仍禁止付费。</p>
    <p>处理恢复任务同时受原任务及各级恢复任务上限约束；预算占用包含其后续处理恢复任务。下方阶段、公司和模型费用明细仅统计当前任务。</p>
    {error&&<p role="alert">{error}</p>}{snapshot?.taskLimit?<p>任务上限 {money(snapshot.taskLimit.limit_micros)} · 保守占用 {money(snapshot.taskLimit.occupied_micros)} · 任务可预留 {money(String(Math.max(0,Number(snapshot.taskLimit.limit_micros)-Number(snapshot.taskLimit.occupied_micros))))}（还受用户余额约束）</p>:snapshot?<p>尚未设置任务单独上限。</p>:!error&&<p>正在读取…</p>}
    {snapshot?.inheritedTaskLimits?.map(limit=><p key={limit.action_id}>继承任务上限 {money(limit.limit_micros)} · 共享保守占用 {money(limit.occupied_micros)} · 可预留 {money(String(Math.max(0,Number(limit.limit_micros)-Number(limit.occupied_micros))))}（所有上限同时生效）</p>)}
    {snapshot&&<CostStageSummary stages={snapshot.stages}/>}
    {snapshot&&<CompanyCostSummary rows={snapshot.companyCosts}/>}
    <ProviderUsageSummary groups={snapshot?.modelUsage}/>
    <form onSubmit={save}><label>任务累计上限（美元）<input inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)} required/></label><button disabled={saving||!amount}>{saving?"保存中…":"确认任务预算"}</button></form>
    <button onClick={()=>setRevision(value=>value+1)}>刷新任务预算</button>
  </>}</details>;
}
