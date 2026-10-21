"use client";
import {useEffect,useRef,useState} from 'react';
export type MailCompanyLinkValue={companyId?:string|null;companyName?:string|null;source?:string|null};
type Props={messageId:string;current?:MailCompanyLinkValue|null;onCurrentChange?:(value:MailCompanyLinkValue|null)=>void;onDeleted?:()=>void;onChanged:()=>void};
type Company={id:string;displayName:string;country:string};
function isLink(value:unknown):value is MailCompanyLinkValue|null{
 if(value===null)return true;if(!value||typeof value!=='object')return false;
 return ['companyId','companyName','source'].every(key=>{const field=(value as Record<string,unknown>)[key];return field===null||typeof field==='string';});
}
export function MailCompanyLink(props:Props){return <CompanyLink key={props.messageId} {...props}/>;}
function CompanyLink(props:Props){return useMailCompanyLink(props);}
export function useMailCompanyLink({messageId,current,onCurrentChange,onDeleted,onChanged}:Props){
 const [saved,setSaved]=useState<MailCompanyLinkValue|null|undefined>(()=>isLink(current)?current:undefined),[companies,setCompanies]=useState<Company[]>([]),[ready,setReady]=useState(false),[company,setCompany]=useState<string>(),[search,setSearch]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[needsRead,setNeedsRead]=useState(false);
 const lock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!lock.current&&!needsRead)setSaved(isLink(current)?current:undefined);},[current,needsRead]);
 const begin=()=>{if(lock.current||!alive.current)return false;lock.current=true;setBusy(true);setError('');return true;};
 const finish=()=>{lock.current=false;if(alive.current)setBusy(false);};
 async function open(){
  if(!begin())return;setCompanies([]);setReady(false);
  try{const response=await fetch('/api/workspaces/current',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();const data=await response.json();
   if(!Array.isArray(data.companies)||!data.companies.every((item:Company)=>item&&typeof item.id==='string'&&typeof item.displayName==='string'&&typeof item.country==='string'))throw new Error();
   if(alive.current){setCompanies(data.companies);setReady(true);}
  }catch{if(alive.current)setError('候选库读取失败，请重试。');}finally{finish();}
 }
 async function readCurrent(){
  const response=await fetch(`/api/mailbox/messages/${messageId}`,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();const data=await response.json();
  if(data?.message?.id!==messageId||!isLink(data.companyLink))throw new Error();
  if(alive.current){setSaved(data.companyLink);setCompany(undefined);setNeedsRead(false);onCurrentChange?.(data.companyLink);}
 }
 async function reconcile(){
  if(!begin())return;setSaved(undefined);const saveConfirmed=notice.startsWith('公司关联已保存');
  try{await readCurrent();if(alive.current)setNotice(saveConfirmed?'公司关联已保存；当前关联已核对。':'当前关联已读取。');}
  catch{if(alive.current){setNeedsRead(true);setError('当前关联读取失败，请重试读取；不会自动重复保存。');}}finally{finish();}
 }
 async function save(){
  if(company===undefined||!ready||needsRead||(company!==''&&!companies.some(item=>item.id===company))||!begin())return;
  const selected=company;setNotice('正在保存关联…');let confirmed=false;
  try{
   const response=await fetch(`/api/mailbox/messages/${messageId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({companyId:selected||null,confirmed:true}),signal:AbortSignal.timeout(10000)});
   if(!response.ok||(await response.json())?.updated!==true)throw new Error();confirmed=true;
   if(alive.current){setNotice('公司关联已保存；后续导入不会覆盖人工选择。');setSaved(undefined);}
   await readCurrent();if(alive.current)onChanged();
  }catch{if(alive.current){if(!confirmed)setNotice('');setNeedsRead(true);setSaved(undefined);setError(confirmed?'保存已确认，但当前关联读取失败。请读取当前关联。':'保存结果未确认，请先读取当前关联；不会自动重复保存。');}}finally{finish();}
 }
 async function remove(){
  if(lock.current||needsRead||!window.confirm('永久删除此本地导入邮件及其待审候选？已确认知识与远程原邮件均保留。')||!begin())return;
  let confirmed=false;setNotice('');
  try{const response=await fetch(`/api/mailbox/messages/${messageId}`,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({confirmed:true}),signal:AbortSignal.timeout(10000)});if(!response.ok||(await response.json())?.deleted!==true)throw new Error();confirmed=true;
   if(alive.current){setSaved(undefined);setNeedsRead(true);setNotice('本地邮件已删除；已确认知识与远程原邮件保留。');onDeleted?.();onChanged();}}
  catch{if(alive.current){setSaved(undefined);setNeedsRead(true);setError(confirmed?'删除已确认，但列表刷新失败。请刷新邮件列表。':'删除结果未确认，请刷新邮件列表核对；不会自动重复删除。');}}finally{finish();}
 }
 const source=saved?.source?({'user-confirmed':'人工关联','domain-match':'域名匹配关联','user-rejected':'人工选择不关联','ambiguous':'暂未确定'} as Record<string,string>)[saved.source]??'关联方式未知':'旧邮件未匹配';
 const filtered=companies.filter(item=>`${item.displayName} ${item.country}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 return <div style={{overflowWrap:'anywhere'}}><p>关联公司：{saved===undefined?'关联信息待核对':saved?.companyName??'未确定 / 待选择'} · {saved===undefined?'请读取当前关联':source}</p>
 <details onToggle={event=>{if(event.target===event.currentTarget&&event.currentTarget.open&&!ready)void open();}}><summary>修改公司关联</summary>
 <label>搜索关联候选公司<input value={search} disabled={busy} onChange={event=>setSearch(event.target.value)}/></label>
 <select aria-label="关联候选公司" style={{maxWidth:'100%'}} value={company===undefined?'__keep_current__':company} disabled={busy||!ready||needsRead} onChange={event=>setCompany(event.target.value==='__keep_current__'?undefined:event.target.value)}>
 <option value="__keep_current__">保留当前关联（不作修改）</option><option value="">不关联任何公司</option>
 {company&&company!=='__keep_current__'&&!filtered.some(item=>item.id===company)&&<option value={company}>{companies.find(item=>item.id===company)?.displayName??'已选候选'}（已选择）</option>}
 {filtered.map(item=><option key={item.id} value={item.id}>{item.displayName} · {item.country}</option>)}</select>
 {!ready&&<p>{busy?'正在读取候选公司…':'候选公司尚未读取。'}</p>}
 <button disabled={busy} onClick={()=>void open()}>刷新候选公司</button><button disabled={busy||!ready||needsRead||company===undefined} onClick={()=>void save()}>确认保存</button></details>
 <button disabled={busy} onClick={()=>void reconcile()}>读取当前关联</button><button disabled={busy||needsRead} onClick={()=>void remove()}>删除此本地邮件（保留知识）</button>
 {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}</div>;
}
