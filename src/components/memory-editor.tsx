"use client";
import { useState } from "react";
import type { MemoryItem } from "@/lib/outreach/memory-management";
export function MemoryEditor({item,onSaved,onCancel}:{item?:MemoryItem;onSaved:()=>void;onCancel:()=>void}){
  const [id]=useState(()=>item?.id??crypto.randomUUID());
  const [kind,setKind]=useState(item?.kind??"email-style");const [title,setTitle]=useState(item?.title??"");
  const [content,setContent]=useState(item?.content??"");const [markets,setMarkets]=useState(item?.marketCodes.join(", ")??"");
  const [roles,setRoles]=useState(item?.channelRoles.join(", ")??"");
  const [external,setExternal]=useState(item?.usageScope==="external-use-approved");const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const split=(value:string)=>[...new Set(value.split(/[,，]/).map(part=>part.trim()).filter(Boolean))];
  async function save(){setBusy(true);setError("");try{
    const response=await fetch("/api/knowledge/memories",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      id,mode:item?"edit":"create",expectedUpdatedAt:item?.updatedAt,kind,title,content,marketCodes:split(markets.toUpperCase()),channelRoles:split(roles),externalUseApproved:external,confirmed})});
    if(!response.ok){const data=await response.json();throw new Error(data.error);}onSaved();
  }catch(error){setError(error instanceof Error?error.message:"保存失败");}finally{setBusy(false);}}
  return <form className="panel" onSubmit={event=>{event.preventDefault();void save();}}><h3>{item?"编辑":"新增"}个人记忆</h3>
    <p>保存新正文会调用已配置的 Embedding 服务；仅改标题或范围会复用向量。不会调用生成模型。公司专属事实请在公司详情维护。</p>
    <fieldset disabled={busy} onChange={()=>setConfirmed(false)}>
      <label>类型<select value={kind} disabled={Boolean(item)} onChange={event=>setKind(event.target.value)}><option value="email-style">邮件风格</option><option value="user-approved-marketing-claim">用户确认业务信息</option></select></label>
      <label>标题<input required maxLength={160} value={title} onChange={event=>setTitle(event.target.value)}/></label>
      <label>内容<textarea required minLength={2} maxLength={1200} value={content} onChange={event=>setContent(event.target.value)}/></label>
      <label>国家代码（逗号分隔，例如 GB, MX；留空不限）<input value={markets} onChange={event=>setMarkets(event.target.value)}/></label>
      <label>渠道角色（逗号分隔，需与候选角色名称一致；留空不限）<input value={roles} onChange={event=>setRoles(event.target.value)}/></label>
      {kind==="user-approved-marketing-claim"&&<label><input type="checkbox" checked={external} onChange={event=>setExternal(event.target.checked)}/>允许在对外邮件使用此信息（不作为客观评分证据）</label>}
    </fieldset>
    <label><input type="checkbox" disabled={busy} checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>确认内容及适用范围并保存到个人记忆</label>
    {error&&<p role="alert">{error}</p>}<button disabled={busy||!confirmed}>保存</button><button type="button" disabled={busy} onClick={onCancel}>取消</button>
  </form>;
}
