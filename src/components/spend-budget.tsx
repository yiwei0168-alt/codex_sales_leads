"use client";
import {useEffect,useState} from "react";
type BudgetSnapshot={budget:{limit_micros:string;occupied_micros:string;remaining_micros:string;frozen:boolean}|null;configuredRules:number;notice:string;stages:Array<{stage:string;calls:number;reserved_micros:string;reported_micros:string|null;unknown_bills:number}>};
function dollars(micros:string|null){return micros===null?"未报告":`$${(Number(micros)/1000000).toFixed(6)}`;}
export function SpendBudget(){
  const [snapshot,setSnapshot]=useState<BudgetSnapshot|null>(null);const [amount,setAmount]=useState("");const [revision,setRevision]=useState(0);const [saving,setSaving]=useState(false);const [error,setError]=useState("");
  useEffect(()=>{const controller=new AbortController();fetch("/api/budget",{signal:controller.signal,cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(data=>{if(!controller.signal.aborted){setSnapshot(data);setError("");}}).catch(()=>{if(!controller.signal.aborted)setError("预算暂不可读取；未将未知金额按零展示。");});return()=>controller.abort();},[revision]);
  async function save(event:React.FormEvent){event.preventDefault();if(!window.confirm(`将累计美元预算设置为 ${amount}？这不会清空历史预留，也不会启动付费任务。`))return;setSaving(true);setError("");try{const response=await fetch("/api/budget",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({limitUsd:amount,confirmed:true})});const data=await response.json();if(!response.ok)throw new Error(data.error);setRevision(value=>value+1);}catch(reason){setError(reason instanceof Error?reason.message:"预算保存失败");}finally{setSaving(false);}}
  return <section><h3>美元预算与预留</h3>{error&&<p role="alert">{error}</p>}{!snapshot&&!error&&<p>正在读取预算…</p>}{snapshot&&<>
    <p>{snapshot.notice}</p>{snapshot.budget?<dl><dt>累计上限</dt><dd>{dollars(snapshot.budget.limit_micros)}</dd><dt>保守占用（非账单）</dt><dd>{dollars(snapshot.budget.occupied_micros)}</dd><dt>可预留余额</dt><dd>{dollars(snapshot.budget.remaining_micros)}</dd></dl>:<p>尚未设置预算；已接入门禁的付费请求不会放行。</p>}
    {snapshot.budget?.frozen&&<p role="alert">服务商报告费用超过已核准上界，账户已冻结付费调用；提高预算不会自动解除。</p>}
    {snapshot.configuredRules===0&&<p role="status">尚无已审核费用上界配置。设置预算不等于可以发起付费请求。</p>}
    {snapshot.stages.map(item=><p key={item.stage}>{item.stage} · {item.calls} 次预留 · 预留 {dollars(item.reserved_micros)} · 服务商报告 {dollars(item.reported_micros)} · {item.unknown_bills} 次费用未知</p>)}</>}
    <form onSubmit={save}><label>新的累计上限（美元）<input inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)} placeholder="例如 50" required/></label><button disabled={saving||!amount}>{saving?"保存中…":"确认修改预算"}</button></form><button onClick={()=>setRevision(value=>value+1)}>刷新预算</button>
  </section>;
}
