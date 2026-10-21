"use client";
import { useRef, useState } from "react";
import type { AgentApproval } from "@/lib/assistant/main/approvals";
import { RawJsonDetails } from "./raw-json-details";
const actionLabels:Record<string,string>={mail_send:"发送邮件",plan_confirmation:"执行计划",mail_message_delete:"删除本地邮件",mail_connection_control:"管理邮箱连接",knowledge_private_delete:"删除私有知识",legacy_memory_delete:"删除个人记忆",skill_delete:"删除方法",schedule_delete:"删除定时任务",knowledge_release_activate:"发布知识版本"};
const fieldLabels:Record<string,string>={to:"收件人",cc:"抄送",bcc:"密送",subject:"主题",body:"正文",messageId:"邮件对象",connectionId:"邮箱连接",documentId:"资料对象",id:"操作对象",title:"标题",name:"名称",action:"最终动作",deleteKnowledge:"同时删除衍生私有知识",companyExternalId:"公司",draftId:"草稿",summary:"计划摘要",plan:"执行计划",items:"执行项目",content:"内容",reason:"原因",decision:"决定",expectedEmail:"邮箱地址",email:"邮箱地址",category:"核验类别",activeStatus:"发布状态",releaseId:"知识版本",confirmed:"确认标记",attachments:"附件"};
function BusinessValue({value}:{value:unknown}) {
  if(value===null||value===undefined)return <>未提供</>;
  if(typeof value==="boolean")return <>{value?"是":"否"}</>;
  if(Array.isArray(value))return <ul>{value.map((item,index)=><li key={index}><BusinessValue value={item}/></li>)}</ul>;
  if(typeof value==="object")return <dl className="approval-fields">{Object.entries(value).map(([key,item])=><div key={key}><dt>{fieldLabels[key]??key}</dt><dd><BusinessValue value={item}/></dd></div>)}</dl>;
  return <span className="approval-value">{String(value)}</span>;
}
function ApprovalPreview({item}:{item:AgentApproval}) {
  if(item.tool_id==='knowledge_private_delete')return <>
    {item.target?.kind==='private-knowledge'&&item.target.state!=='unavailable'?<>
      <p><strong>资料：</strong><span className="approval-value">{item.target.title}</span></p>
      <p>将永久删除这份私有资料及其检索片段。</p>
      {item.target.state==='changed'&&<p role="status">资料版本已变化，原确认参数不能删除新版本。请重新读取资料后再确认。</p>}
    </>:<p role="status">当前无法核对这份私有资料，请重新读取后再确认。</p>}
    <RawJsonDetails summary="工具参数与版本详情" value={item.payload}/>
  </>;
  const mail=item.tool_id==="mail_send"?item.payload as {to?:string;subject?:string;body?:string;attachments?:Array<{filename:string;sha256:string}>}:null;
  if(mail&&typeof mail.to==="string"&&typeof mail.subject==="string"&&typeof mail.body==="string")return <>
    <p><strong>收件人：</strong>{mail.to}</p><p><strong>主题：</strong>{mail.subject}</p><pre>{mail.body}</pre>
    {mail.attachments?.length? <div><strong>附件</strong><ul>{mail.attachments.map((a,index)=><li key={index}>{a.filename} <small>内容指纹 {a.sha256.slice(0,12)}</small></li>)}</ul></div>:<small>无附件</small>}
  </>;
  const payload=item.payload&&typeof item.payload==="object"?item.payload as Record<string,unknown>:{};
  const business=Object.fromEntries(Object.entries(payload).filter(([key])=>!(/hash|revision|version|sha256/i.test(key))));
  return <><BusinessValue value={business}/><RawJsonDetails summary="工具参数与版本详情" value={item.payload}/></>;
}
export function AgentApprovals({ items,disabled=false }: { items: AgentApproval[];disabled?:boolean }) {
  const [error, setError] = useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);const inFlight=useRef(false);
  const locked=busy||disabled;
  const [decisions,setDecisions]=useState<Record<string,"approve"|"deny"|"revoke">>({});
  const key=(item:AgentApproval)=>`${item.id}:${item.parameter_hash}`;
  // Only a successful server response supplies a local receipt. Keep it while
  // polling catches up; a new parameter hash requires its own confirmation.
  const visible=items.flatMap(item=>{
    const decision=decisions[key(item)];
    if(decision==="deny"||decision==="revoke")return [];
    return [{...item,status:decision==="approve"&&item.status==="pending"?"approved" as const:item.status}];
  }).filter(item=>item.status==="pending"||item.status==="approved");
  const pendingMail=visible.filter(i=>i.tool_id==="mail_send"&&i.status==="pending");
  async function approveBatch() {
    if(inFlight.current||disabled||pendingMail.length<2)return;inFlight.current=true;setBusy(true);setError("");setNotice("");
    const submitted=pendingMail;
    try {
      const r=await fetch("/api/assistant/approvals/batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:submitted.map(i=>({id:i.id,parameterHash:i.parameter_hash}))})});
      if(!r.ok)throw new Error("批次内容或状态已变化，请刷新后逐封核对");
      setDecisions(current=>({...current,...Object.fromEntries(submitted.map(item=>[key(item),"approve" as const]))}));
      setNotice(`本次提交的 ${submitted.length} 封邮件的批准决定已保存，请以任务执行结果为准。`);
    }catch{setError("批次决定尚未确认，请刷新后逐封核对内容和状态。");}
    finally{inFlight.current=false;setBusy(false);}
  }
  async function decide(item: AgentApproval, decision: "approve" | "deny" | "revoke") {
    if(inFlight.current||disabled)return;inFlight.current=true;setBusy(true);setError("");setNotice("");
    try { const r = await fetch(`/api/assistant/approvals/${item.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, parameterHash: item.parameter_hash }) });
      if (!r.ok) throw new Error("确认内容或状态已变化，请刷新后核对");
      setDecisions(current=>({...current,[key(item)]:decision}));
      setNotice(`${decision==="approve"?"批准":decision==="deny"?"拒绝":"撤销"}决定已保存${decision==="approve"?"，请以任务执行结果为准":""}。`);
    } catch { setError("决定尚未确认，请刷新后核对内容和状态。"); }
    finally{inFlight.current=false;setBusy(false);}
  }
  return <>{visible.map(item => <article key={item.id} className="agent-approval" aria-busy={busy}>
    <strong>确认{actionLabels[item.tool_id]??"操作"}</strong><p className="approval-status">{item.status==="approved"?"已批准，等待执行结果":"待你核对并批准"}</p>
    <details><summary>操作来源</summary><span>{item.tool_id} · {item.tool_version}</span></details>
    <p className="text-sm">以下是本次实际执行内容。内容发生变化后，需要重新确认。</p>
    <ApprovalPreview item={item}/>
    <div className="agent-run-actions">{item.status === "pending" && <><button type="button" disabled={locked} onClick={() => void decide(item, "approve")}>确认此内容</button><button type="button" disabled={locked} onClick={() => void decide(item, "deny")}>拒绝</button></>}
      <button type="button" disabled={locked} onClick={() => void decide(item, "revoke")}>撤销</button></div>
  </article>)}{pendingMail.length>1&&<button type="button" disabled={locked} onClick={()=>void approveBatch()}>确认以上全部邮件（{pendingMail.length} 封）</button>}{busy&&<p role="status">正在保存决定…</p>}{notice&&<p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}</>;
}
