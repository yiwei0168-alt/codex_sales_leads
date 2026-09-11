"use client";
import { useEffect,useState } from "react";
import { KnowledgeRevisions } from "./knowledge-revisions";
type Item={id:string;title:string;sourceUrl?:string;updatedAt:string;status:string;scope:string;excerpt?:string};
export function KnowledgeLibrary(){
  const [open,setOpen]=useState(false);const [scope,setScope]=useState("private");const [query,setQuery]=useState("");const [filter,setFilter]=useState("");const [offset,setOffset]=useState(0);const [items,setItems]=useState<Item[]>([]);const [more,setMore]=useState(false);const [error,setError]=useState("");const [revision,setRevision]=useState(0);
  useEffect(()=>{if(!open)return;const controller=new AbortController();fetch(`/api/knowledge/library?${new URLSearchParams({scope,q:filter,offset:String(offset)})}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(data=>{if(!controller.signal.aborted){setItems(data.items);setMore(data.hasMore);setError("");}}).catch(()=>{if(!controller.signal.aborted)setError("读取失败，请重试");});return()=>controller.abort();},[open,scope,filter,offset,revision]);
  async function remove(item:Item){if(!window.confirm(`永久删除私有知识“${item.title}”及其检索片段？原始邮件不删除，此操作不可撤销。`))return;try{const response=await fetch("/api/knowledge/library",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:item.id,confirmed:true})});if(!response.ok)throw new Error();setRevision(value=>value+1);}catch{setError("删除失败，未确认删除成功");}}
  return <details className="panel span-12" onToggle={event=>setOpen(event.currentTarget.open)}><summary>知识与公共证据记录管理</summary>
    <p>个人知识、共享知识与公共证据分开读取。陈旧证据只提醒，不自动搜索；删除个人知识不会删除原始邮件。</p>
    <select aria-label="知识范围" value={scope} onChange={event=>{setScope(event.target.value);setOffset(0);setItems([]);}}><option value="private">我的私有知识</option><option value="shared">共享知识（只读）</option><option value="evidence">公共证据库（只读）</option></select>
    <form onSubmit={event=>{event.preventDefault();setFilter(query);setOffset(0);}}><input maxLength={200} placeholder="名称或证据网址" value={query} onChange={event=>setQuery(event.target.value)}/><button>本地检索</button></form><button onClick={()=>setRevision(value=>value+1)}>刷新</button>
    {error&&<p role="alert">{error}</p>}{items.map(item=><article className="opportunity-card" key={item.id}><strong>{item.title}</strong><p>{item.status} · {item.updatedAt}</p><details><summary>查看已保存摘要</summary><p>{item.excerpt??"无文本片段"}</p></details>{item.sourceUrl&&/^https?:\/\//i.test(item.sourceUrl)&&<a href={item.sourceUrl} target="_blank" rel="noreferrer">来源</a>}{scope==="private"&&<KnowledgeRevisions documentId={item.id}/>} {scope==="private"&&<button onClick={()=>void remove(item)}>删除此私有知识</button>}</article>)}
    <button disabled={offset===0} onClick={()=>setOffset(value=>Math.max(0,value-50))}>上一页</button><span>第 {offset/50+1} 页</span><button disabled={!more} onClick={()=>setOffset(value=>value+50)}>下一页</button>
  </details>;
}
