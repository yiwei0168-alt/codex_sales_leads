"use client";
import {useState} from "react";
import type {AssistantActionDto,BudgetProposal} from "@/lib/assistant/types";
/** Model output is a suggestion, never mutation authority or an authoritative task ID. */
export function BudgetProposalCard({proposal,actions}:{proposal:BudgetProposal;actions:AssistantActionDto[]}){
  const [amount,setAmount]=useState(proposal.limitUsd),[actionId,setActionId]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const tasks=actions.filter(action=>action.actionType==="lead-search"&&action.status!=="cancelled");
  const selected=tasks.find(action=>action.id===actionId);
  async function save(event:React.FormEvent){
    event.preventDefault();if(proposal.scope==="task"&&!selected)return;
    const target=proposal.scope==="user"?"用户累计总预算":`${selected!.payload.countryName} 搜索任务 ${selected!.id}`;
    if(!window.confirm(`将${target}的累计上限设为 ${amount} 美元？不是追加额度，不清空历史占用，不启动或续跑任务。`))return;
    setBusy(true);setMessage("");try{
      const response=await fetch("/api/budget",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({limitUsd:amount,confirmed:true,...(proposal.scope==="task"?{actionId}: {})})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||"预算保存失败");setMessage("预算已保存；没有启动任务。实际调用仍须通过费用上界与用户总预算检查。");
    }catch(error){setMessage(error instanceof Error?error.message:"保存失败");}finally{setBusy(false);}
  }
  return <form className="ai-action-card budget-proposal-card" onSubmit={save}>
    <p>预算修改提案 · {proposal.scope==="user"?"用户累计总上限":"已有搜索任务累计上限"} · USD</p>
    {proposal.scope==="task"&&<label>选择本对话的搜索任务<select required value={actionId} onChange={event=>setActionId(event.target.value)}><option value="">请核对后选择</option>{tasks.map(action=><option key={action.id} value={action.id}>{action.payload.countryName} · {action.payload.roles.join("/")} · {action.payload.targetCount}家 · {action.id.slice(0,8)}</option>)}</select></label>}
    {proposal.scope==="task"&&!tasks.length&&<p>本对话没有可选任务。请先建立待执行计划；其他对话的任务可在任务中心设置。</p>}
    <label>提案累计上限（美元）<input inputMode="decimal" required value={amount} onChange={event=>setAmount(event.target.value)}/></label>
    <p>旧提案可能过时，请重新核对；模型识别本身受现有预算限制，首次设置可直接使用任务中心表单。</p>
    <button disabled={busy||!amount||(proposal.scope==="task"&&!selected)}>{busy?"保存中…":"确认预算提案"}</button>{message&&<p role="status">{message}</p>}
  </form>;
}
