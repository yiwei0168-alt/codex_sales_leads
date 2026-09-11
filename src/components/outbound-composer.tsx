"use client";
import { useEffect,useState } from "react";
type Mail={id:string;status:string;subject:string;bodyText:string;sender:string[];recipients:string[];sentAt:string|null;createdAt:string;reconciledByUser?:boolean};
export function OutboundComposer({companyId,draft,onSent}:{companyId:string;draft:string;onSent:()=>void}) {
  const [connections,setConnections]=useState<Array<{id:string;email:string;status:string}>>([]);
  const [connectionId,setConnectionId]=useState("");const [verified,setVerified]=useState(false);
  const [to,setTo]=useState("");const [subject,setSubject]=useState("");const [body,setBody]=useState("");
  const [messages,setMessages]=useState<Mail[]>([]);const [parent,setParent]=useState<Mail|null>(null);
  const [instructions,setInstructions]=useState("");const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);const [locked,setLocked]=useState(false);const [confirmed,setConfirmed]=useState(false);
  const [key,setKey]=useState(()=>crypto.randomUUID());const [revision,setRevision]=useState(0);
  const [offset,setOffset]=useState(0);const [hasMore,setHasMore]=useState(false);
  const [followUpDraftId,setFollowUpDraftId]=useState<string>();
  const [savedFollowUps,setSavedFollowUps]=useState<Array<{id:string;subject:string;bodyText:string;createdAt:string}>>([]);
  useEffect(()=>{if(!parent)return;const controller=new AbortController();
    fetch(`/api/mailbox/outbound/follow-up?parentId=${parent.id}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(data=>{if(!controller.signal.aborted)setSavedFollowUps(data.drafts);}).catch(()=>{if(!controller.signal.aborted)setNotice("已保存跟进草稿读取失败，可重选原邮件重试。");});return()=>controller.abort();},[parent,revision]);
  useEffect(()=>{
    const controller=new AbortController();
    Promise.all([fetch("/api/mailbox/connections",{signal:controller.signal}),fetch(`/api/mailbox/outbound?company=${encodeURIComponent(companyId)}&offset=${offset}`,{signal:controller.signal,cache:"no-store"})])
      .then(async responses=>{if(responses.some(response=>!response.ok))throw new Error();return Promise.all(responses.map(response=>response.json()));})
      .then(([mailboxes,history])=>{if(controller.signal.aborted)return;setConnections(mailboxes.connections.filter((item:{status:string})=>item.status==="active"));setMessages(history.messages);setHasMore(history.hasMore);})
      .catch(()=>{if(!controller.signal.aborted)setNotice("邮件连接或发送历史读取失败，请刷新重试");});
    return()=>controller.abort();
  },[companyId,revision,offset]);
  async function post(url:string,payload:unknown){const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw new Error(data.error);return data;}
  async function verify(){setBusy(true);try{await post("/api/mailbox/outbound",{action:"verify",connectionId});setVerified(true);setNotice("发信连接验证成功");}catch(error){setNotice(String(error));}finally{setBusy(false);}}
  async function send(){if(!confirmed||locked)return;setBusy(true);setLocked(true);
    try{const data=await post("/api/mailbox/outbound",{connectionId,companyExternalId:companyId,to,subject,body,idempotencyKey:key,parentId:parent?.id,followUpDraftId,confirmed:true});
      setNotice(data.status==="sent"?"邮件已提交给发信服务器，发送时间已保存。":"发送未成功确认，请核实记录；本次草稿锁定以避免重复发送。");
      if(data.status==="sent")onSent();
    }catch(error){setNotice(`${String(error)} 请先核实发送状态。`);}finally{setRevision(value=>value+1);setBusy(false);}}
  async function generate(){if(!parent)return;setBusy(true);try{const data=await post("/api/mailbox/outbound/follow-up",{parentId:parent.id,instructions});setSubject(data.draft.subject);setBody(data.draft.body);setFollowUpDraftId(data.draftId);setRevision(value=>value+1);setConfirmed(false);}catch(error){setNotice(String(error));}finally{setBusy(false);}}
  function choose(mail:Mail,followUp=true){
    const sender=connections.find(item=>item.email===mail.sender[0]);
    setConnectionId(sender?.id??"");setVerified(false);setInstructions("");setNotice("");
    setFollowUpDraftId(undefined);
    setSavedFollowUps([]);
    setParent(followUp?mail:null);setTo(followUp?(mail.recipients[0]??""):"");
    setSubject(followUp&&!/^re:/i.test(mail.subject)?`Re: ${mail.subject}`:mail.subject);
    setBody(followUp?"":mail.bodyText);setConfirmed(false);setLocked(false);setKey(crypto.randomUUID());
  }
  async function reconcile(mail:Mail,outcome:"sent"|"not-sent"){
    let sentAt:string|undefined;
    if(outcome==="sent"){const date=window.prompt("请先核对外部邮箱已发送记录，填写实际发送时间（ISO 格式，例如 2026-09-11T10:00:00+08:00）");if(!date)return;sentAt=date.trim();}
    if(!window.confirm(outcome==="sent"?"确认已从外部邮箱核实发送成功？记录将标注为用户核实，不代表收件人已读。":"确认已从外部邮箱核实没有发送？本操作只更改记录，不会重新发送。"))return;
    setBusy(true);try{const response=await fetch("/api/mailbox/outbound",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:mail.id,outcome,sentAt,confirmed:true})});const data=await response.json();if(!response.ok)throw new Error(data.error);setRevision(value=>value+1);if(outcome==="sent")onSent();setNotice("已保存用户核实结果，没有重发邮件。");}catch(error){setNotice(String(error));}finally{setBusy(false);}
  }
  return <section className="panel"><h2>邮件发送与跟进</h2>{notice&&<p role="status">{notice}</p>}
    <label>发件邮箱<select disabled={busy||locked} value={connectionId} onChange={event=>{setConnectionId(event.target.value);setVerified(false);setConfirmed(false);}}><option value="">选择已连接邮箱</option>{connections.map(item=><option key={item.id} value={item.id}>{item.email}</option>)}</select></label>
    <button disabled={!connectionId||busy||locked} onClick={verify}>{verified?"发信连接已验证":"验证发信连接"}</button>
    <details><summary>发送历史 · 第 {offset/50+1} 页 · 本页已发送 {messages.filter(mail=>mail.status==="sent").length} 封</summary>{messages.map(mail=><article key={mail.id}>
      <strong>{mail.subject}</strong><p>{mail.recipients.join(", ")} · {mail.sentAt??mail.createdAt} · {mail.status}{mail.reconciledByUser?"（用户核实）":""}</p>
      {["unknown","sending"].includes(mail.status)&&<details><summary>核实发送结果（不重发）</summary><p>请先在外部邮箱检查；发送中记录至少等待十分钟。</p><button disabled={busy} onClick={()=>void reconcile(mail,"sent")}>已核实发送成功</button><button disabled={busy} onClick={()=>void reconcile(mail,"not-sent")}>已核实未发送</button></details>}
      <details><summary>查看邮件详情</summary><pre style={{whiteSpace:"pre-wrap"}}>{mail.bodyText}</pre></details>
      {mail.status==="sent"&&<button disabled={busy} onClick={()=>choose(mail)}>写跟进邮件</button>}
      {mail.status==="sent"&&<button disabled={busy} onClick={()=>choose(mail,false)}>复用于本公司其他联系人</button>}
    </article>)}<button disabled={busy||offset===0} onClick={()=>{setMessages([]);setOffset(value=>Math.max(0,value-50));}}>上一页</button><button disabled={busy||!hasMore} onClick={()=>{setMessages([]);setOffset(value=>value+50);}}>下一页</button></details>
    {parent&&<div><details><summary>展开原开发邮件</summary><pre style={{whiteSpace:"pre-wrap"}}>{parent.bodyText}</pre></details>
      {savedFollowUps.length>0&&<details><summary>复用已保存跟进草稿（最近 10 版，不调用模型）</summary>{savedFollowUps.map(item=><div key={item.id}><span>{item.createdAt} · {item.subject}</span><button disabled={busy||locked} onClick={()=>{setSubject(item.subject);setBody(item.bodyText);setFollowUpDraftId(item.id);setConfirmed(false);}}>载入审核</button></div>)}</details>}
      <label>希望跟进什么？<textarea disabled={busy||locked} value={instructions} onChange={event=>setInstructions(event.target.value)} placeholder="例如：询问是否看过资料，建议下周安排简短会议"/></label>
      <button disabled={busy||locked||instructions.trim().length<2} onClick={generate}>生成跟进草稿</button></div>}
    <fieldset disabled={busy||locked}><label>收件人<input type="email" value={to} onChange={event=>{setTo(event.target.value);setConfirmed(false);}}/></label>
      <label>主题<input maxLength={300} value={subject} onChange={event=>{setSubject(event.target.value);setConfirmed(false);}}/></label>
      <button type="button" onClick={()=>{setBody(draft);setConfirmed(false);}}>复用当前开发邮件正文</button>
      <label>正文<textarea value={body} onChange={event=>{setBody(event.target.value);setConfirmed(false);}}/></label>
      <label><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>已核对收件人、称呼、主题和正文，确认发送</label>
    </fieldset>
    <button className="primary-button" disabled={busy||locked||!verified||!confirmed||!to||!subject||!body} onClick={send}>{busy?"正在处理…":locked?"本次发送已锁定":"确认发送这封邮件"}</button>
    <p>不会自动群发或回复。发送成功不代表对方已送达或已读。</p>
  </section>;
}
