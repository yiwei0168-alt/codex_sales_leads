"use client";
import { useState } from "react";
import type { AgentApproval } from "@/lib/assistant/main/approvals";
function ApprovalPreview({item}:{item:AgentApproval}) {
  const mail=item.tool_id==="mail_send"?item.payload as {to?:string;subject?:string;body?:string;attachments?:Array<{filename:string;sha256:string}>}:null;
  if(mail&&typeof mail.to==="string"&&typeof mail.subject==="string"&&typeof mail.body==="string")return <>
    <p><strong>收件人：</strong>{mail.to}</p><p><strong>主题：</strong>{mail.subject}</p><pre>{mail.body}</pre>
    {mail.attachments?.length? <div><strong>附件</strong><ul>{mail.attachments.map((a,index)=><li key={index}>{a.filename} <small>内容指纹 {a.sha256.slice(0,12)}</small></li>)}</ul></div>:<small>无附件</small>}
  </>;
  return <pre>{JSON.stringify(item.payload,null,2)}</pre>;
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
    <strong>{item.tool_id==="mail_send"?"确认邮件":`确认操作 · ${item.tool_id}`}</strong>
    <p className="text-sm">以下是本次实际执行内容。内容发生变化后，需要重新确认。</p>
    <ApprovalPreview item={item}/>
    <div className="agent-run-actions">{item.status === "pending" && <><button type="button" onClick={() => void decide(item, "approve")}>确认此内容</button><button type="button" onClick={() => void decide(item, "deny")}>拒绝</button></>}
      <button type="button" onClick={() => void decide(item, "revoke")}>撤销</button></div>
  </article>)}{pendingMail.length>1&&<button type="button" onClick={()=>void approveBatch()}>确认以上全部邮件（{pendingMail.length} 封）</button>}{error && <p role="alert">{error}</p>}</>;
}
