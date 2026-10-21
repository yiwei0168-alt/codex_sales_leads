"use client";
import {useEffect,useRef,useState} from 'react';
type Mail={id:string;subject:string;bodyText:string;direction:'inbound'|'outbound';sentAt?:string|null;sender:{address:string;role?:string}[];recipients:{address:string;role?:string}[]};
function isMail(value:unknown):value is Mail{
 if(!value||typeof value!=='object')return false;const row=value as Record<string,unknown>;
 const addresses=(items:unknown)=>Array.isArray(items)&&items.every(item=>item&&typeof item==='object'&&typeof item.address==='string'&&(item.role===undefined||typeof item.role==='string'));
 return typeof row.id==='string'&&row.id.length>0&&typeof row.subject==='string'&&typeof row.bodyText==='string'&&
  (row.direction==='inbound'||row.direction==='outbound')&&(row.sentAt===undefined||row.sentAt===null||typeof row.sentAt==='string')&&addresses(row.sender)&&addresses(row.recipients);
}
function isPage(value:unknown,direction:Mail['direction']):value is {messages:Mail[];hasMore:boolean}{
 if(!value||typeof value!=='object'||!('messages' in value)||!('hasMore' in value))return false;
 return Array.isArray(value.messages)&&value.messages.length<=20&&typeof value.hasMore==='boolean'&&
  value.messages.every(item=>isMail(item)&&item.direction===direction)&&new Set(value.messages.map(item=>item.id)).size===value.messages.length;
}
export function MailboxReader({direction}:{direction:Mail['direction']}){
 return <Reader key={direction} direction={direction}/>;
}
function Reader({direction}:{direction:Mail['direction']}){
 const [offset,setOffset]=useState(0),[items,setItems]=useState<Mail[]>([]),[more,setMore]=useState(false),[id,setId]=useState(''),[mail,setMail]=useState<Mail|null>(null),[error,setError]=useState(''),[mailError,setMailError]=useState(''),[listRevision,setListRevision]=useState(0),[readRevision,setReadRevision]=useState(0),[loading,setLoading]=useState(true);
 const listEpoch=useRef(0),readEpoch=useRef(0);
 useEffect(()=>{
  const controller=new AbortController(),epoch=++listEpoch.current;
  const current=()=>epoch===listEpoch.current&&!controller.signal.aborted;
  const failed=()=>{setItems([]);setMore(false);setLoading(false);setError('邮件列表读取失败');readEpoch.current++;setId('');setMail(null);setMailError('');};
  const timeout=setTimeout(()=>{if(current()){controller.abort();failed();}},10000);
  fetch(`/api/mailbox/messages?direction=${direction}&offset=${offset}`,{signal:controller.signal,cache:'no-store'})
   .then(async response=>{if(!response.ok)throw new Error();return response.json();})
   .then(data=>{if(!isPage(data,direction))throw new Error();if(current()){setItems(data.messages);setMore(data.hasMore);setError('');setLoading(false);}})
   .catch(()=>{if(current())failed();}).finally(()=>clearTimeout(timeout));
  return()=>{controller.abort();clearTimeout(timeout);};
 },[direction,offset,listRevision]);
 useEffect(()=>{
  if(!id)return;const controller=new AbortController(),epoch=++readEpoch.current;
  const current=()=>epoch===readEpoch.current&&!controller.signal.aborted;
  const failed=()=>{setMail(null);setMailError('邮件原文读取失败');};
  const timeout=setTimeout(()=>{if(current()){controller.abort();failed();}},10000);
  fetch(`/api/mailbox/messages/${id}`,{signal:controller.signal,cache:'no-store'})
   .then(async response=>{if(!response.ok)throw new Error();return response.json();})
   .then(data=>{if(!data||!isMail(data.message)||data.message.id!==id||data.message.direction!==direction)throw new Error();if(current()){setMail(data.message);setMailError('');}})
   .catch(()=>{if(current())failed();}).finally(()=>clearTimeout(timeout));
  return()=>{controller.abort();clearTimeout(timeout);};
 },[id,direction,readRevision]);
 function clearReader(){readEpoch.current++;setId('');setMail(null);setMailError('');}
 function refresh(){listEpoch.current++;readEpoch.current++;setItems([]);setMore(false);setError('');setMail(null);setMailError('');setLoading(true);setListRevision(value=>value+1);setReadRevision(value=>value+1);}
 function movePage(value:number){clearReader();listEpoch.current++;setItems([]);setMore(false);setError('');setLoading(true);setOffset(value);}
 function select(value:string){readEpoch.current++;setMail(null);setMailError('');setId(value);setReadRevision(revision=>revision+1);}
 function retryOriginal(){readEpoch.current++;setMail(null);setMailError('');setReadRevision(value=>value+1);}
 return <div className={`mail-reader ${id?"has-selection":""}`}><aside><div className="mailbox-actionbar"><span>本页 {items.length} 封</span><button disabled={loading} onClick={refresh}>刷新</button></div>{error&&<p role="alert" className="workspace-error">{error} <button onClick={refresh}>重试邮件列表</button></p>}
 <div className="mail-reader-list">{items.map(item=><button key={item.id} className={id===item.id?'selected':''} onClick={()=>select(item.id)}><strong>{item.subject||'无主题'}</strong><small>{item.sender.map(p=>p.address).join(', ')} · {item.sentAt?new Date(item.sentAt).toLocaleString():'时间未知'}</small><span>{item.bodyText}</span></button>)}{!items.length&&!error&&<p>{loading?'正在读取…':'没有已同步邮件。使用“管理 / 连接邮箱”同步近期收件和已发送。'}</p>}</div>
 <nav><button disabled={loading||!offset} onClick={()=>movePage(offset-20)}>上一页</button><span>第 {offset/20+1} 页</span><button disabled={loading||!more} onClick={()=>movePage(offset+20)}>下一页</button></nav></aside>
 <section className="mail-reader-body" aria-label="邮件阅读区"><button className="mail-reader-back" onClick={clearReader}>返回邮件列表</button>{mailError&&<p role="alert">{mailError} <button onClick={retryOriginal}>重试邮件原文</button></p>}{mail?<><h3>{mail.subject||'无主题'}</h3><p>发件：{mail.sender.map(p=>p.address).join(', ')}</p><p>收件 / 抄送：{mail.recipients.map(p=>`${p.address}${p.role?` (${p.role})`:''}`).join(', ')}</p><p>{mail.sentAt?new Date(mail.sentAt).toLocaleString():'时间未知'}</p><pre>{mail.bodyText}</pre></>:!mailError&&<p>{id?'正在读取原文…':'选择一封邮件阅读'}</p>}</section></div>;
}
