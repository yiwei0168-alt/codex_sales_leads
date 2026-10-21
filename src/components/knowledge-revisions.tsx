"use client";
import {useEffect,useState} from "react";
type Revision={id:string;title:string;time:string;content:string;truncated:boolean;reconstructed:boolean};
function isRevisionPage(value:unknown):value is {items:Revision[];hasMore:boolean}{
  if(!value||typeof value!=="object"||!("items" in value)||!("hasMore" in value))return false;
  if(!Array.isArray(value.items)||value.items.length>10||typeof value.hasMore!=="boolean")return false;
  return value.items.every(item=>item&&typeof item==="object"&&typeof item.id==="string"&&item.id.length>0&&
    typeof item.title==="string"&&typeof item.time==="string"&&typeof item.content==="string"&&
    typeof item.truncated==="boolean"&&typeof item.reconstructed==="boolean")&&new Set(value.items.map(item=>item.id)).size===value.items.length;
}
export function KnowledgeRevisions({documentId}:{documentId:string}){
  return <RevisionHistory key={documentId} documentId={documentId}/>;
}
function RevisionHistory({documentId}:{documentId:string}){
  const [loading,setLoading]=useState(true),[retry,setRetry]=useState(0),[open,setOpen]=useState(false);
  const [offset,setOffset]=useState(0),[items,setItems]=useState<Revision[]>([]);
  const [more,setMore]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();
    const failed=()=>{setItems([]);setMore(false);setLoading(false);setError("版本读取失败");};
    const timeout=setTimeout(()=>{controller.abort();failed();},10000);
    fetch(`/api/knowledge/library/history?document=${encodeURIComponent(documentId)}&offset=${offset}`,{signal:controller.signal,cache:"no-store"})
      .then(async response=>{if(!response.ok)throw new Error();return response.json();})
      .then(data=>{
        if(!isRevisionPage(data))throw new Error();
        if(!controller.signal.aborted){setItems(data.items);setMore(data.hasMore);setError("");setLoading(false);}
      }).catch(()=>{if(!controller.signal.aborted)failed();}).finally(()=>clearTimeout(timeout));
    return()=>{clearTimeout(timeout);controller.abort();};
  },[open,offset,documentId,retry]);
  const start=()=>{setItems([]);setMore(false);setLoading(true);setError("");};
  return <details onToggle={event=>{
    if(event.target!==event.currentTarget)return;
    if(event.currentTarget.open)start();
    setOpen(event.currentTarget.open);
  }}>
    <summary>历史内容版本</summary>
    <p>从版本保留功能启用后开始记录；删除文档会一并删除这些版本。</p>
    {loading&&<p role="status">正在读取版本…</p>}
    {error&&<p role="alert">{error} <button type="button" onClick={()=>{start();setRetry(value=>value+1);}}>重试</button></p>}
    {!loading&&!error&&items.map(item=><details key={item.id}>
      <summary>{item.title} · {item.time}</summary>
      {item.reconstructed&&<p>旧版本由历史检索片段重建，可能存在重叠；不代表原文件逐字副本。</p>}
      <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{item.content}</pre>
      {item.truncated&&<p>此处仅预览前5000字；完整历史内容保存在数据库。</p>}
    </details>)}
    {!items.length&&!error&&!loading&&<p>没有历史版本</p>}
    <nav aria-label="历史版本分页"><button type="button" disabled={loading||!offset} onClick={()=>{start();setOffset(value=>Math.max(0,value-10));}}>上一页版本</button>
      <span>第 {offset/10+1} 页</span>
      <button type="button" disabled={loading||Boolean(error)||!more} onClick={()=>{start();setOffset(value=>value+10);}}>下一页版本</button></nav>
  </details>;
}
