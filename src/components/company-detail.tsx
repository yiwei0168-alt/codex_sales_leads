"use client";
import { useEffect,useState } from "react";
import type { CompanyRecord,Evidence } from "@/lib/domain";
import type { CompanyContactDetailsDto } from "@/lib/sales/types";
import { CompanyClassificationEditor } from "./company-classification-editor";
import { opportunityStages } from "@/lib/sales/opportunity-stages";
export function CompanyDetail({company,contactDetails,onClose,onUpdate,onEvidence,onOpenAssistant}:{company:CompanyRecord;contactDetails?:CompanyContactDetailsDto;onClose:()=>void;onUpdate:(patch:Partial<CompanyRecord>)=>void;onEvidence:(evidence:Evidence)=>void;onOpenAssistant:()=>void}){
  const [tab,setTab]=useState("overview");const [assessment,setAssessment]=useState<Record<string,unknown>|null>(null);const [loaded,setLoaded]=useState(false);const [error,setError]=useState("");
  useEffect(()=>{if(tab!=="score")return;const controller=new AbortController();
    fetch(`/api/workspaces/current/companies/${encodeURIComponent(company.id)}/assessment`,{signal:controller.signal,cache:"no-store"})
      .then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(data=>{if(!controller.signal.aborted){setAssessment(data.assessment);setLoaded(true);}})
      .catch(()=>{if(!controller.signal.aborted)setError("评分记录读取失败，请切换页签重试");});return()=>controller.abort();
  },[company.id,tab]);
  const [lookup,setLookup]=useState(false);const [lookupResult,setLookupResult]=useState("");
  const [details,setDetails]=useState(contactDetails);
  async function contacts(refresh=false){setLookup(true);setError("");try{const response=await fetch("/api/contact-enrichment/lookup",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({externalId:company.id,refresh})});const data=await response.json();if(!response.ok)throw new Error(data.error);setLookupResult(`${data.cached?"复用已保存结果，未再次查询服务商":"查询已完成并保存"} · ${data.capturedAt}`);
    const workspace=await fetch("/api/workspaces/current",{cache:"no-store"});if(!workspace.ok)throw new Error("查询已保存，但刷新联系人失败，请重新打开页面");const updated=await workspace.json();setDetails(updated.contactsByCompanyId?.[company.id]);
  }catch(error){setError(String(error));}finally{setLookup(false);}}
  return <div className="drawer-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><aside className="company-drawer" role="dialog" aria-modal="true" aria-label={`${company.displayName} 公司详情`}>
    <header className="drawer-header"><h2>{company.displayName}</h2><button onClick={onClose}>关闭</button></header>
    <nav className="results-toolbar">{[["overview","概览"],["score","评分与证据"],["development","开发记录"]].map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    <div className="drawer-body">{error&&<p role="alert">{error}</p>}
      {tab==="overview"&&<><p>{company.summary}</p><p>{company.country} · {company.city}</p>{company.domain&&<a href={`https://${company.domain}`} target="_blank" rel="noreferrer">官网：{company.domain}</a>}
        <p>主角色：{company.primaryBusinessRole??company.roles[0]??"未明确"}；辅助角色：{company.roles.filter(role=>role!==(company.primaryBusinessRole??company.roles[0])).join(" / ")||"无"}</p>
        <CompanyClassificationEditor company={company} onUpdate={onUpdate}/>
        <details><summary>推荐合作路径（最多两条）</summary>{company.cooperationPaths?.slice().sort((a,b)=>a.rank-b.rank).slice(0,2).map(path=><article key={path.pathId}><p>{path.pathType} · 适配分 {path.fitScore}</p><button onClick={()=>onUpdate({selectedPathId:path.pathId})}>选择此路径</button></article>)}{!company.cooperationPaths?.length&&<p>未生成路径，不会自动调用 Agent。</p>}</details>
        <details><summary>联系人与邮箱 · {details?.contacts.length??0} 位</summary>
          {details?.contacts.map(contact=><p key={contact.id}>{contact.fullName} · {contact.jobTitle??"职位未明确"} · {contact.status} · {contact.sourceProvider}</p>)}
          {details?.emails.map(email=><p key={email.id}>{email.email} · {email.status==="Invalid"?"无效":email.verification?.category==="NeedsReview"||email.status==="Pattern-guessed"||email.status==="Unknown"?"待复核":email.status}</p>)}
          <p>默认复用已有查询缓存。无缓存时可能消耗服务额度；未配置时不执行。</p><button disabled={lookup} onClick={()=>void contacts()}>查询 / 复用联系人</button>
          <button disabled={lookup} onClick={()=>{if(window.confirm("重新调用联系人服务，可能消耗额度。是否确认？"))void contacts(true);}}>重新核实（可能付费）</button>
          {lookupResult&&<p role="status">{lookupResult}</p>}
        </details></>}
      {tab==="score"&&<><h3>{company.assessmentNeedsRefresh?"历史评分待更新":`综合评分 ${company.fitScore}`}</h3>
        {!loaded&&!error&&<p>正在读取…</p>}{loaded&&!assessment&&<p>没有关联到版本化评分记录；不推算子项分数。</p>}
        {assessment&&<><p>政策版本：{String(assessment.policyVersion??"历史版本未知")} · 评分时间：{String(assessment.assessedAt??"未知")}</p><details open><summary>原始子项评分</summary><pre style={{whiteSpace:"pre-wrap"}}>{JSON.stringify(assessment.dimensions,null,2)}</pre></details><details><summary>评分政策及权重</summary><pre style={{whiteSpace:"pre-wrap"}}>{JSON.stringify(assessment.policySnapshot,null,2)}</pre></details></>}
        {company.evidence.map(item=><button className="evidence-card" key={item.id} onClick={()=>onEvidence(item)}>{item.claim} · {item.status} · {item.capturedAt}</button>)}
        <h3>风险与未知</h3>{[...company.risks,...company.unknowns].map((text,index)=><p key={index}>{text}</p>)}</>}
      {tab==="development"&&<><p>生成或批准草稿不代表已发送。</p><label>开发阶段<select value={company.opportunityStage} onChange={event=>onUpdate({opportunityStage:event.target.value as CompanyRecord["opportunityStage"]})}><option value="Discovered">未加入开发</option>{opportunityStages.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <p>下一步：{company.nextAction||"未设置"} · {company.nextActionDueAt??"无到期日期"}</p><p>产品发信 {company.outreachSummary?.sentCount??0} 封 · 最近 {company.outreachSummary?.lastSentAt??"无记录"}</p>
        <button onClick={onOpenAssistant}>查看已有策略、邮件历史与跟进</button></>}
    </div><footer className="drawer-footer"><button onClick={onClose}>关闭</button><button className="primary-button" onClick={onOpenAssistant}>打开开发助手（不自动生成）</button></footer>
  </aside></div>;
}
