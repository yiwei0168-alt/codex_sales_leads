"use client";
import {useEffect,useState} from "react";
type Message={id:string;subject:string;sentAt:string|null;direction:string;source:string};
function OriginalMail({id}:{id:string}){
  const [body,setBody]=useState<string>();const [error,setError]=useState(false);
  useEffect(()=>{const controller=new AbortController();fetch(`/api/mailbox/messages/${id}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(data=>{if(!controller.signal.aborted)setBody(data.message.bodyText);}).catch(()=>{if(!controller.signal.aborted)setError(true);});return()=>controller.abort();},[id]);
  return error?<p role="alert">原文读取失败，请重新展开。</p>:<pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{body??"正在读取原文…"}</pre>;
}
export function CompanyCorrespondence({companyId}:{companyId:string}){
  const [messages,setMessages]=useState<Message[]>([]);const [offset,setOffset]=useState(0);const [more,setMore]=useState(false);const [error,setError]=useState("");const [loaded,setLoaded]=useState(false);const [revision,setRevision]=useState(0);const [opened,setOpened]=useState<string[]>([]);
  useEffect(()=>{const controller=new AbortController();fetch(`/api/workspaces/current/companies/${encodeURIComponent(companyId)}/correspondence?offset=${offset}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(data=>{if(!controller.signal.aborted){setMessages(data.messages);setMore(data.hasMore);setLoaded(true);setError("");}}).catch(()=>{if(!controller.signal.aborted)setError("邮件列表读取失败，请重试。");});return()=>controller.abort();},[companyId,offset,revision]);
  function page(value:number){setOffset(value);setMessages([]);setOpened([]);setLoaded(false);setError("");}
  return <section><h3>已关联往来邮件</h3><p>仅显示已导入并关联当前公司的邮件，不自动同步邮箱。公司关联不代表同一邮件会话。</p>{error&&<p role="alert">{error}</p>}<button onClick={()=>setRevision(value=>value+1)}>刷新本地记录</button>{!loaded&&!error&&<p>正在读取…</p>}{loaded&&!messages.length&&<p>暂无已关联邮件，可到邮箱知识中导入或手动关联。</p>}{messages.map(message=><details key={message.id} onToggle={event=>{const open=event.currentTarget.open;setOpened(values=>open?[...new Set([...values,message.id])]:values.filter(id=>id!==message.id));}}><summary>{message.direction==="inbound"?"收件":"发件"} · {message.sentAt??"时间未知"} · {message.subject||"无主题"}</summary><p>{message.source==="user-confirmed"?"人工关联":"域名匹配关联"}</p>{opened.includes(message.id)&&<OriginalMail id={message.id}/>}</details>)}<p>第 {offset/20+1} 页 <button disabled={!offset} onClick={()=>page(Math.max(0,offset-20))}>上一页</button><button disabled={!more||!loaded} onClick={()=>page(offset+20)}>下一页</button></p></section>;
}
