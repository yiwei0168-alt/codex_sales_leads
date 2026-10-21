"use client";
import {useEffect,useRef,useState} from 'react';
type Message={id:string;subject:string;sentAt:string|null;direction:'inbound'|'outbound';source:'domain-match'|'user-confirmed'};
function isPage(value:unknown):value is {messages:Message[];hasMore:boolean}{
 if(!value||typeof value!=='object'||!('messages' in value)||!('hasMore' in value))return false;
 if(!Array.isArray(value.messages)||value.messages.length>20||typeof value.hasMore!=='boolean')return false;
 return value.messages.every(row=>row&&typeof row==='object'&&typeof row.id==='string'&&row.id.length>0&&typeof row.subject==='string'&&
  (row.sentAt===null||typeof row.sentAt==='string')&&(row.direction==='inbound'||row.direction==='outbound')&&(row.source==='domain-match'||row.source==='user-confirmed'))&&new Set(value.messages.map(row=>row.id)).size===value.messages.length;
}
function OriginalMail({id}:{id:string}){
 const [body,setBody]=useState<string>(),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();let active=true;
  const current=()=>active&&!controller.signal.aborted;
  const failed=()=>{setBody(undefined);setError('原文读取失败，请重试。');};
  const timeout=setTimeout(()=>{if(current()){controller.abort();failed();}},10000);
  fetch(`/api/mailbox/messages/${encodeURIComponent(id)}`,{signal:controller.signal,cache:'no-store'})
   .then(async response=>{if(!response.ok)throw new Error();return response.json();})
   .then(data=>{if(data?.message?.id!==id||typeof data.message.bodyText!=='string')throw new Error();if(current()){setBody(data.message.bodyText);setError('');}})
   .catch(()=>{if(current())failed();}).finally(()=>clearTimeout(timeout));
  return()=>{active=false;controller.abort();clearTimeout(timeout);};
 },[id,retry]);
 if(error)return <p role="alert">{error} <button type="button" onClick={()=>{setBody(undefined);setError('');setRetry(value=>value+1);}}>重试原文</button></p>;
 return body===undefined?<p role="status">正在读取原文…</p>:<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{body}</pre>;
}
export function CompanyCorrespondence({companyId}:{companyId:string}){return <Correspondence key={companyId} companyId={companyId}/>;}
function Correspondence({companyId}:{companyId:string}){
 const [messages,setMessages]=useState<Message[]>([]),[offset,setOffset]=useState(0),[more,setMore]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0),[opened,setOpened]=useState<string[]>([]);
 const sequence=useRef(0);
 useEffect(()=>{
  const controller=new AbortController(),request=++sequence.current;let active=true;
  const current=()=>active&&request===sequence.current&&!controller.signal.aborted;
  const failed=()=>{setMessages([]);setOpened([]);setMore(false);setLoading(false);setError('邮件列表读取失败，请重试。');};
  const timeout=setTimeout(()=>{if(current()){controller.abort();failed();}},10000);
  fetch(`/api/workspaces/current/companies/${encodeURIComponent(companyId)}/correspondence?offset=${offset}`,{signal:controller.signal,cache:'no-store'})
   .then(async response=>{if(!response.ok)throw new Error();return response.json();})
   .then(data=>{if(!isPage(data))throw new Error();if(current()){setMessages(data.messages);setMore(data.hasMore);setLoading(false);setError('');}})
   .catch(()=>{if(current())failed();}).finally(()=>clearTimeout(timeout));
  return()=>{active=false;controller.abort();clearTimeout(timeout);};
 },[companyId,offset,revision]);
 function page(value:number){sequence.current++;setMessages([]);setOpened([]);setMore(false);setLoading(true);setError('');if(value===offset)setRevision(revision=>revision+1);else setOffset(value);}
 return <section aria-label="公司往来邮件" style={{overflowWrap:'anywhere'}}><h3>已关联往来邮件</h3><p>仅显示已导入并关联当前公司的邮件，不自动同步邮箱。公司关联不代表同一邮件会话。</p>
 {error&&<p role="alert">{error}</p>}<button type="button" disabled={loading} onClick={()=>page(offset)}>刷新本地记录</button>
 {loading&&<p role="status">正在读取…</p>}{!loading&&!error&&!messages.length&&<p>暂无已关联邮件，可到邮箱知识中导入或手动关联。</p>}
 {messages.map(message=><details key={message.id} onToggle={event=>{if(event.target!==event.currentTarget)return;const open=event.currentTarget.open;setOpened(values=>open?[...new Set([...values,message.id])]:values.filter(id=>id!==message.id));}}>
  <summary>{message.direction==='inbound'?'收件':'发件'} · {message.sentAt??'时间未知'} · {message.subject||'无主题'}</summary><p>{message.source==='user-confirmed'?'人工关联':'域名匹配关联'}</p>{opened.includes(message.id)&&<OriginalMail id={message.id}/>}
 </details>)}
 <p>第 {offset/20+1} 页 <button type="button" disabled={loading||!offset} onClick={()=>page(Math.max(0,offset-20))}>上一页</button><button type="button" disabled={loading||!more} onClick={()=>page(offset+20)}>下一页</button></p></section>;
}
