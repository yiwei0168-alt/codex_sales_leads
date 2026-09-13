"use client";
import {useEffect,useState} from "react";
import {ProviderUsageSummary} from "./provider-usage-summary";
import {CostStageSummary} from "./cost-stage-summary";
import type {CostStageSummary as CostStage} from "@/lib/billing/cost-summary";
import type {ProviderUsageSummary as UsageSummary} from "@/lib/billing/usage-summary-types";
import type {BillingReferenceStatus} from "@/lib/billing/reference-status";
type BudgetSnapshot={referenceVerification?:BillingReferenceStatus;openRouterRateReference?:{checkedAt:string|null;nextAttemptAt:string|null;status:string;hold:boolean|null};tariffVerification?:{checkedAt:string;rules:Array<{key:string;reference:string;verifiedAt:string;withinVerificationWindow:boolean;effectiveExpiresAt:string|null}>};modelUsage?:UsageSummary[];budget:{limit_micros:string;occupied_micros:string;remaining_micros:string;frozen:boolean;suspended_rules?:number}|null;configuredRules:number;notice:string;stages:CostStage[]};
function dollars(micros:string|null){return micros===null?"未报告":`$${(Number(micros)/1000000).toFixed(6)}`;}
export function SpendBudget(){
  const [snapshot,setSnapshot]=useState<BudgetSnapshot|null>(null);const [amount,setAmount]=useState("");const [revision,setRevision]=useState(0);const [saving,setSaving]=useState(false);const [error,setError]=useState("");
  useEffect(()=>{const controller=new AbortController();fetch("/api/budget",{signal:controller.signal,cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(data=>{if(!controller.signal.aborted){setSnapshot(data);setError("");}}).catch(()=>{if(!controller.signal.aborted)setError("预算暂不可读取；未将未知金额按零展示。");});return()=>controller.abort();},[revision]);
  async function save(event:React.FormEvent){event.preventDefault();if(!window.confirm(`将累计美元预算设置为 ${amount}？这不会清空历史预留，也不会启动付费任务。`))return;setSaving(true);setError("");try{const response=await fetch("/api/budget",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({limitUsd:amount,confirmed:true})});const data=await response.json();if(!response.ok)throw new Error(data.error);setRevision(value=>value+1);}catch(reason){setError(reason instanceof Error?reason.message:"预算保存失败");}finally{setSaving(false);}}
  return <section><h3>美元预算与预留</h3>{error&&<p role="alert">{error}</p>}{!snapshot&&!error&&<p>正在读取预算…</p>}{snapshot&&<>
    <p>{snapshot.notice}</p>{snapshot.budget?<dl><dt>累计上限</dt><dd>{dollars(snapshot.budget.limit_micros)}</dd><dt>保守占用（非账单）</dt><dd>{dollars(snapshot.budget.occupied_micros)}</dd><dt>可预留余额</dt><dd>{dollars(snapshot.budget.remaining_micros)}</dd></dl>:<p>尚未设置预算；已接入门禁的付费请求不会放行。</p>}
    {snapshot.budget?.frozen&&<p role="alert">服务商报告费用超过已核准上界，账户已冻结付费调用；提高预算不会自动解除。</p>}
    {snapshot.configuredRules===0&&<p role="status">尚无已审核费用上界配置。设置预算不等于可以发起付费请求。</p>}
    <details><summary>费用上界核验期限</summary><p>仅列静态请求上界；动态模型费率和汇率另行检查。期限内仍需满足请求契约、预算及暂停规则，不代表可发起付费调用。缺失或过期继续阻止请求，提高预算不会延长期限。</p>
      {!snapshot.tariffVerification?<p>暂无期限观测，不能推断费率可用。</p>:<><p>观测时间：{snapshot.tariffVerification.checkedAt}；刷新预算可重新核对。</p>
        <ul>{snapshot.tariffVerification.rules.map(rule=><li key={rule.key} style={{overflowWrap:'anywhere'}}><a href={rule.reference} target="_blank" rel="noreferrer">{rule.key}</a>：{rule.withinVerificationWindow?'核验期限内':'核验期限失效，阻止调用'}；有效截止 {rule.effectiveExpiresAt??'未知'}（UTC）</li>)}</ul></>}
    </details>
    <details><summary>OpenRouter 公开费率复核</summary><p>当前仅自动复核已核准的 Sol 标准请求公开证据；结果不会延长静态费率有效期，也不会自动启用新费率或路由。页面刷新只读数据库。</p>
      <p data-testid="openrouter-rate-status">状态：{snapshot.openRouterRateReference?.status==='validated'?'公开证据与基线一致':snapshot.openRouterRateReference?.status==='review-required'?'公开证据变化，待确认并暂停新预留':snapshot.openRouterRateReference?.status==='unavailable'?'公开复核暂不可用，静态期限独立生效':'尚无公开复核记录'}；上次检查 {snapshot.openRouterRateReference?.checkedAt??'未知'}；下次尝试 {snapshot.openRouterRateReference?.nextAttemptAt??'未知'}（UTC）</p>
    </details>
    {snapshot.openRouterRateReference?.hold===true&&<p role="alert">Sol 公开费用合同待审，新预留已暂停；提高预算不会解除暂停。</p>}
    <details><summary>人民币模型费率与汇率期限</summary><p>当前记录仅说明核验期限。人民币费用按有效汇率并加5%保守预留缓冲换算；仍需检查实际请求契约、预算及规则暂停。刷新本页面只读数据库，不刷新外部费率或延长核验期限。</p>
      {!snapshot.referenceVerification?<p>暂无参考值观测，不能推断可用。</p>:<>
        <ul>{snapshot.referenceVerification.rules.map(rule=><li key={rule.key} style={{overflowWrap:'anywhere'}}><a href={rule.reference} target="_blank" rel="noreferrer">{rule.key}</a>：{rule.withinVerificationWindow?'核验期限内':'核验期限失效，阻止调用'}；有效截止 {rule.effectiveExpiresAt??'未知'}（UTC）</li>)}</ul>
        <p data-testid="fx-reference-status">汇率参考：{snapshot.referenceVerification.fx.status==='valid'?'核验期限内':snapshot.referenceVerification.fx.status==='expired-or-invalid'?'已过期或时间无效，阻止调用':'尚无有效观测，阻止调用'}；参考日期 {snapshot.referenceVerification.fx.asOf??'未知'}；取得时间 {snapshot.referenceVerification.fx.retrievedAt??'未知'}；72小时有效截止 {snapshot.referenceVerification.fx.effectiveExpiresAt??'未知'}（UTC）</p>
      </>}
    </details>
    {!!snapshot.budget?.suspended_rules&&<p role="alert">{snapshot.budget.suspended_rules} 项费率版本因费用超界暂停；其他规则仍按预算审核，提高预算不会解除规则暂停。</p>}
    <CostStageSummary stages={snapshot.stages}/></>}
    <ProviderUsageSummary groups={snapshot?.modelUsage}/>
    <form onSubmit={save}><label>新的累计上限（美元）<input inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)} placeholder="例如 50" required/></label><button disabled={saving||!amount}>{saving?"保存中…":"确认修改预算"}</button></form><button onClick={()=>setRevision(value=>value+1)}>刷新预算</button>
  </section>;
}
