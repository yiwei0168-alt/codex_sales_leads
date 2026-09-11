"use client";
import { useState } from "react";
import { primaryRole,type CompanyRecord } from "@/lib/domain";
import type { CompanyEditablePatch } from "@/lib/sales/types";
import { opportunityStages,stageLabel } from "@/lib/sales/opportunity-stages";
import { BulkCompanyActions } from "./bulk-company-actions";

export function OpportunityWorkspace({companies,onSelect,onUpdate,onOpenMail}: {
  companies:CompanyRecord[];onSelect:(id:string)=>void;onUpdate:(id:string,patch:CompanyEditablePatch)=>Promise<boolean>;onOpenMail:(id:string)=>void;
}) {
  const [view,setView]=useState("board");
  const [filter,setFilter]=useState("all");
  const [editing,setEditing]=useState<CompanyRecord|null>(null);
  const [action,setAction]=useState("");const [due,setDue]=useState("");
  const [saving,setSaving]=useState(false);
  const now=new Date().toISOString().slice(0,10);
  const visible=companies.filter(company=>filter==="all"||
    (filter==="contacted"?company.opportunityStage==="Contacted":Boolean(company.nextActionDueAt&&company.nextActionDueAt<now)));
  function edit(company:CompanyRecord){setEditing(company);setAction(company.nextAction);setDue(company.nextActionDueAt??"");}
  function card(company:CompanyRecord){return <article key={company.id} className="opportunity-card">
    <button className="card-company" onClick={()=>onSelect(company.id)}><strong>{company.displayName}</strong></button>
    <p>{primaryRole(company)} · {company.accountTier}</p><p>{company.nextAction||"尚未设置下一步"}</p>
    {company.nextActionDueAt&&<p>{company.nextActionDueAt<now?"已逾期 · ":"到期 · "}{company.nextActionDueAt}</p>}
    {company.outreachSummary?.sentCount ? <p>首次：{company.outreachSummary.firstSentAt?.slice(0,10)} · 最近：{company.outreachSummary.lastSentAt?.slice(0,10)} · 跟进{company.outreachSummary.followUpCount}次</p>
      : company.opportunityStage==="Contacted" ? <p>手动标记已联系 · 无产品发信记录</p> : null}
    <button onClick={()=>onOpenMail(company.id)}>邮件详情与跟进</button>
    <select aria-label={`修改${company.displayName}开发阶段`} value={company.opportunityStage==="Contact Prepared"?"Priority":company.opportunityStage}
      onChange={event=>onUpdate(company.id,{opportunityStage:event.target.value as CompanyRecord["opportunityStage"]})}>
      {opportunityStages.map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select>
    <button onClick={()=>edit(company)}>设置下一步</button>
    <button onClick={()=>onUpdate(company.id,{opportunityStage:"Discovered"})}>移出开发名单</button>
  </article>;}
  return <section>
    <div className="results-toolbar"><button onClick={()=>setView("board")} aria-pressed={view==="board"}>看板</button><button onClick={()=>setView("list")} aria-pressed={view==="list"}>列表</button>
      <select aria-label="筛选开发机会" value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">全部机会</option><option value="contacted">已联系</option><option value="overdue">已逾期</option></select>
      <span>{visible.length} 家公司</span></div>
    <BulkCompanyActions companies={visible} onUpdate={onUpdate}/>
    {editing&&<form className="panel" onSubmit={async event=>{event.preventDefault();if(saving)return;setSaving(true);try{if(await onUpdate(editing.id,{nextAction:action,nextActionDueAt:due}))setEditing(null);}finally{setSaving(false);}}}>
      <h3>{editing.displayName} · 下一步</h3><label>行动内容<textarea maxLength={2000} value={action} onChange={event=>setAction(event.target.value)}/></label>
      <label>到期日期<input type="date" value={due} onChange={event=>setDue(event.target.value)}/></label><button disabled={saving}>{saving?"保存中…":"保存"}</button><button type="button" disabled={saving} onClick={()=>setEditing(null)}>取消</button>
    </form>}
    {view==="board"?<div className="opportunity-board">{opportunityStages.map(([stage,label])=>{
      const items=visible.filter(company=>company.opportunityStage===stage||(stage==="Priority"&&company.opportunityStage==="Contact Prepared"));
      return <section key={stage} className="board-column"><header>{label} · {items.length}</header>{items.map(card)}</section>;
    })}</div>:<div>{visible.map(company=><div key={company.id}><small>{stageLabel(company.opportunityStage)}</small>{card(company)}</div>)}</div>}
    {!visible.length&&<p>暂无符合条件的开发机会。请从销售线索中加入公司。</p>}
  </section>;
}
