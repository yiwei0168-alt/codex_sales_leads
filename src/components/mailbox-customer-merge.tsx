"use client";
import {useEffect,useState} from 'react';
import type {Customer as MergeCustomer} from './mailbox-customers';
export function MailboxCustomerMerge({customerId,busy,dirty,onMerge}:{customerId:string;busy:boolean;dirty:boolean;onMerge:(target:MergeCustomer)=>void}){
 const [open,setOpen]=useState(false),[attempt,setAttempt]=useState(0),[state,setState]=useState<'loading'|'ready'|'failed'>('loading');
 const [targets,setTargets]=useState<MergeCustomer[]>([]),[selected,setSelected]=useState('');
 useEffect(()=>{
  if(!open)return;const controller=new AbortController();
  async function load(){
   try{
    const all:MergeCustomer[]=[];
    for(let offset=0;;offset+=20){
     const response=await fetch(`/api/mailbox/customers?offset=${offset}&archived=false`,{signal:controller.signal,cache:'no-store'});
     if(!response.ok)throw new Error('load');const data=await response.json();
     if(!Array.isArray(data.items)||data.hasMore&&data.items.length===0)throw new Error('invalid-page');
     all.push(...data.items);if(!data.hasMore)break;
    }
    if(!controller.signal.aborted){setTargets(all.filter(row=>row.id!==customerId));setState('ready');}
   }catch{if(!controller.signal.aborted){setTargets([]);setSelected('');setState('failed');}}
  }
  void load();return()=>controller.abort();
 },[open,attempt,customerId]);
 const target=targets.find(row=>row.id===selected);
 return <details onToggle={event=>{const next=event.currentTarget.open;setOpen(next);setSelected('');setTargets([]);setState('loading');}}>
  <summary>合并到另一家公司</summary>
  <p>将本公司往来并入目标时间线，本记录移入已移除公司；原备注保留在原记录中。</p>
  {dirty&&<p role="status">请先保存当前编辑，再进行合并。</p>}
  {state==='loading'&&open&&<p role="status">正在读取合并目标…</p>}
  {state==='failed'&&<p role="alert">合并目标读取失败。<button type="button" disabled={busy} onClick={()=>{setState('loading');setAttempt(value=>value+1);}}>重试合并目标</button></p>}
  {state==='ready'&&!targets.length&&<p>没有可合并的其他公司。</p>}
  <select aria-label="合并目标" disabled={busy||state!=='ready'} value={selected} onChange={event=>setSelected(event.target.value)}><option value="">选择目标公司</option>{targets.map(row=><option key={row.id} value={row.id}>{row.name} ({row.domain})</option>)}</select>
  <button type="button" disabled={busy||dirty||state!=='ready'||!target} onClick={()=>{if(target)onMerge(target);}}>确认合并</button>
 </details>;
}
