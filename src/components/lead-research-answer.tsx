"use client";

import { useEffect, useState } from "react";

interface ResearchState {
  requests: Array<{candidateId:string;companyName:string;question:string;questionHash:string;supportsRelationshipAnswer:boolean}>;
  answers: Array<{candidateId:string;questionHash:string;relationshipStatus:string;receivedAt:string}>;
  status:string;
}

export function LeadResearchAnswer({actionId,onChange}:{actionId:string;onChange:()=>void}) {
  const [data,setData]=useState<ResearchState>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    void fetch(`/api/assistant/actions/${actionId}/research-answer`,{cache:"no-store",signal:controller.signal})
      .then(async r=>{if(r.ok)setData(await r.json());})
      .catch(e=>{if(e.name!=="AbortError")setError("补证记录暂时无法读取，请刷新重试");});
    return ()=>controller.abort();
  },[actionId]);
  async function submit(item:NonNullable<typeof data>["requests"][number],relationshipStatus:string,answer:string) {
    setBusy(true);setError("");
    try {
      const response=await fetch(`/api/assistant/actions/${actionId}/research-answer`,{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({candidateId:item.candidateId,
          questionHash:item.questionHash,relationshipStatus,answer})});
      const body=await response.json();
      if(!response.ok)throw Error(body.error??"补证提交失败");
      setData(body);setMessage(body.queued?"补证已收到，任务已排队继续审核；尚未代表审核通过。":"补证已保存，当前仍需继续核实。");
      onChange();
    }catch(e){setError(e instanceof Error?e.message:"补证提交失败");}finally{setBusy(false);}
  }
  return <div aria-live="polite">{data?.requests.map(item=>{
    const saved=data.answers.find(a=>a.candidateId===item.candidateId&&a.questionHash===item.questionHash);
    return <div key={item.questionHash} className="ai-action-card">
      <strong>{item.companyName} · 审核补证</strong><p>{item.question}</p>
      {saved?<p>补证已保存 · {new Date(saved.receivedAt).toLocaleString("zh-CN")} · {saved.relationshipStatus==="none"?"目前无关系":saved.relationshipStatus==="exists"?"已有关系":"无法确认"}。最终审核结果以任务状态为准。</p>
        :item.supportsRelationshipAnswer?<><p>请确认目前与 Cudy 是否有合作、股权或合同关系。回答仅作为本账号内部证据；不代表对方有合作意愿。</p>
          <button disabled={busy} onClick={()=>void submit(item,"none","目前与 Cudy 没有合作、股权或合同关系")}>目前没有关系，提交并继续审核</button>
          <button disabled={busy} onClick={()=>void submit(item,"exists","目前与 Cudy 已有关系，仍需进一步核实")}>已有关系</button>
          <button disabled={busy} onClick={()=>void submit(item,"unknown","目前无法确认与 Cudy 的关系")}>无法确认</button></>
        :<p>此问题需要进一步核实，不能用关系声明自动通过。</p>}
    </div>;
  })}{message&&<p>{message}</p>}{error&&<p role="alert">{error}</p>}</div>;
}
