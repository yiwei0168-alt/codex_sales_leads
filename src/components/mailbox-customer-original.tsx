"use client";

import {useEffect,useState} from 'react';
import {WorkspaceDialog} from './workspace-dialog';

/** Mounted only while this timeline event's original is open. Reads never mutate the timeline. */
function OriginalReader({messageId}:{messageId:string}){
 const [attempt,setAttempt]=useState(0);
 const [result,setResult]=useState<{attempt:number;body?:string;error?:string}|null>(null);
 useEffect(()=>{
  const controller=new AbortController();let finished=false;
  const timeout=window.setTimeout(()=>{if(finished)return;finished=true;controller.abort();setResult({attempt,error:'原邮件读取超时，请重试。'});},10000);
  void (async()=>{
   try{
    const response=await fetch(`/api/mailbox/messages/${encodeURIComponent(messageId)}`,{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error([401,403,404].includes(response.status)?'原邮件当前不可读取，请刷新时间线核对。':'原邮件读取失败，请重试。');
    const data=await response.json();
    if(data?.message?.id!==messageId||typeof data.message.bodyText!=='string')throw new Error('原邮件响应不完整或与当前邮件不符，请重试。');
    if(!finished)setResult({attempt,body:data.message.bodyText});
   }catch(error){if(!finished)setResult({attempt,error:error instanceof Error?error.message:'原邮件读取失败，请重试。'});}
   finally{finished=true;window.clearTimeout(timeout);}
  })();
  return()=>{finished=true;window.clearTimeout(timeout);controller.abort();};
 },[messageId,attempt]);
 const current=result?.attempt===attempt?result:null;
 return <>{!current&&<p role="status">正在读取原邮件…</p>}{current?.error&&<p role="alert">{current.error} <button type="button" onClick={()=>setAttempt(value=>value+1)}>重试原邮件</button></p>}{current?.body!==undefined&&<pre className="mail-original-text">{current.body}</pre>}</>;
}

export function MailboxCustomerOriginal({messageId}:{messageId:string}){
 const [open,setOpen]=useState(false);
 return <><button type="button" onClick={()=>setOpen(true)}>查看原邮件</button>{open&&<WorkspaceDialog title="原邮件正文" onClose={()=>setOpen(false)}><OriginalReader messageId={messageId}/></WorkspaceDialog>}</>;
}
