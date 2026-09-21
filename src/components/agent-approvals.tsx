"use client";
import { useState } from "react";
import type { AgentApproval } from "@/lib/assistant/main/approvals";
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
  const mail=item.tool_id==="mail_send"?item.payload as {to?:string;subject?:string;body?:string;attachments?:Array<{filename:string;sha256:string}>}:null;
  if(mail&&typeof mail.to==="string"&&typeof mail.subject==="string"&&typeof mail.body==="string")return <>
    <p><strong>收件人：</strong>{mail.to}</p><p><strong>主题：</strong>{mail.subject}</p><pre>{mail.body}</pre>
    {mail.attachments?.length? <div><strong>附件</strong><ul>{mail.attachments.map((a,index)=><li key={index}>{a.filename} <small>内容指纹 {a.sha256.slice(0,12)}</small></li>)}</ul></div>:<small>无附件</small>}
  </>;
  const payload=item.payload&&typeof item.payload==="object"?item.payload as Record<string,unknown>:{};
  const business=Object.fromEntries(Object.entries(payload).filter(([key])=>!(/hash|revision|version|sha256/i.test(key))));
  return <><BusinessValue value={business}/><details><summary>工具参数与版本详情</summary><pre>{JSON.stringify(item.payload,null,2)}</pre></details></>;
}
export function AgentApprovals({ items }: { items: AgentApproval[] }) {
  const [error, setError] = useState("");
  const pendingMail=items.filter(i=>i.tool_id==="mail_send"&&i.status==="pending");
  async function approveBatch() {
    setError("");
    try {
      const r=await fetch("/api/assistant/approvals/batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:pendingMail.map(i=>({id:i.id,parameterHash:i.parameter_hash}))})});
      if(!r.ok)throw new Error("批次内容或状态已变化，请刷新后逐封核对");
    }catch(e){setError(e instanceof Error?e.message:"确认失败");}
  }
  async function decide(item: AgentApproval, decision: "approve" | "deny" | "revoke") {
    setError("");
    try { const r = await fetch(`/api/assistant/approvals/${item.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, parameterHash: item.parameter_hash }) });
      if (!r.ok) throw new Error("确认内容或状态已变化，请刷新后核对");
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
  }
  return <>{items.filter(i => i.status === "pending" || i.status === "approved").map(item => <article key={item.id} className="agent-approval">
    <strong>确认{actionLabels[item.tool_id]??"操作"}</strong><p className="approval-status">{item.status==="approved"?"已批准，等待执行结果":"待你核对并批准"}</p>
    <details><summary>操作来源</summary><span>{item.tool_id} · {item.tool_version}</span></details>
    <p className="text-sm">以下是本次实际执行内容。内容发生变化后，需要重新确认。</p>
    <ApprovalPreview item={item}/>
    <div className="agent-run-actions">{item.status === "pending" && <><button type="button" onClick={() => void decide(item, "approve")}>确认此内容</button><button type="button" onClick={() => void decide(item, "deny")}>拒绝</button></>}
      <button type="button" onClick={() => void decide(item, "revoke")}>撤销</button></div>
  </article>)}{pendingMail.length>1&&<button type="button" onClick={()=>void approveBatch()}>确认以上全部邮件（{pendingMail.length} 封）</button>}{error && <p role="alert">{error}</p>}</>;
}
