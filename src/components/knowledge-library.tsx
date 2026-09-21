"use client";
import { useEffect,useState } from "react";
import { KnowledgeRevisions } from "./knowledge-revisions";
type Item={id:string;title:string;sourceUrl?:string;assetId?:string;documentType?:string;version?:string;updatedAt:string;status:string;scope:string;excerpt?:string};
export function KnowledgeLibrary(){
  const [selected,setSelected]=useState<Item|null>(null);const [content,setContent]=useState<string|null>(null);const [reading,setReading]=useState(false);const [scope,setScope]=useState("private");const [query,setQuery]=useState("");const [filter,setFilter]=useState("");const [offset,setOffset]=useState(0);const [items,setItems]=useState<Item[]>([]);const [more,setMore]=useState(false);const [error,setError]=useState("");const [revision,setRevision]=useState(0);
  useEffect(()=>{const controller=new AbortController();fetch(`/api/knowledge/library?${new URLSearchParams({scope,q:filter,offset:String(offset)})}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(data=>{if(!controller.signal.aborted){setItems(data.items);setMore(data.hasMore);setError("");}}).catch(()=>{if(!controller.signal.aborted)setError("读取失败，请重试");});return()=>controller.abort();},[scope,filter,offset,revision]);
  async function remove(item:Item){if(!window.confirm(`永久删除私有知识“${item.title}”及其检索片段？原始邮件不删除，此操作不可撤销。`))return;try{const response=await fetch("/api/knowledge/library",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:item.id,confirmed:true})});if(!response.ok)throw new Error();setRevision(value=>value+1);}catch{setError("删除失败，未确认删除成功");}}
  useEffect(()=>{
    if(!selected)return;
    const controller=new AbortController();
    fetch(`/api/knowledge/library/${selected.id}?scope=${scope}`,{signal:controller.signal,cache:"no-store"})
      .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error??"资料读取失败");return body;})
      .then(body=>{if(!controller.signal.aborted){setContent(body.item.content??"暂无已保存正文，请打开原始资料。");setError("");}})
      .catch(reason=>{if(!controller.signal.aborted)setError(reason.message);})
      .finally(()=>{if(!controller.signal.aborted)setReading(false);});
    return()=>controller.abort();
  },[selected,scope,revision]);
  function sources(item:Item){return <div className="library-links">{item.assetId&&<a href={`/api/knowledge/assets/${item.assetId}`} target="_blank" rel="noreferrer">打开原始资料</a>}{item.sourceUrl&&/^https?:\/\//i.test(item.sourceUrl)&&<a href={item.sourceUrl} target="_blank" rel="noreferrer">查看来源</a>}{scope==="private"&&<KnowledgeRevisions documentId={item.id}/>}</div>;}
  return <section className="knowledge-library" aria-label="资料列表">
    {selected ? <article className="library-reader"><button className="secondary-button" onClick={()=>{setSelected(null);setContent(null);setError("");}}>返回资料列表</button><h2>{selected.title}</h2>{sources(selected)}{reading&&<p role="status">正在读取资料…</p>}{error&&<p role="alert">{error}<button onClick={()=>{setReading(true);setRevision(value=>value+1);}}>重试</button></p>}<p className="subtle">正文按已保存的检索片段顺序展示，可能含重叠内容；原始排版请查看原始资料。</p><div className="library-body">{content}</div></article> : <>
    <div className="library-toolbar"><label>范围<select aria-label="知识范围" value={scope} onChange={event=>{setScope(event.target.value);setOffset(0);setItems([]);}}><option value="private">我的私有知识</option><option value="shared">共享知识（只读）</option><option value="evidence">公共证据库（只读）</option></select></label>
    <form onSubmit={event=>{event.preventDefault();setFilter(query);setOffset(0);}}><input aria-label="搜索资料" maxLength={200} placeholder="搜索名称或证据网址" value={query} onChange={event=>setQuery(event.target.value)}/><button className="secondary-button">搜索</button></form><button onClick={()=>setRevision(value=>value+1)}>刷新资料</button></div>
    {error&&<p role="alert">{error}<button onClick={()=>setRevision(value=>value+1)}>重试</button></p>}
    <div className="library-list">{items.map(item=><article className="library-row" key={item.id}><div><button className="library-title" onClick={()=>{setSelected(item);setContent(null);setError("");setReading(true);}}>{item.title}</button><p>{item.status} · {item.documentType??"已保存文本"}{item.version?` · ${item.version}`:""} · {item.updatedAt?.slice(0,10)}</p><p className="library-excerpt">{item.excerpt??"无文本摘要"}</p>{sources(item)}</div>{scope==="private"&&<button className="text-button" onClick={()=>void remove(item)}>删除此私有知识</button>}</article>)}</div>
    {!error&&!items.length&&<p className="empty-state">此范围暂无资料。可以调整筛选，或通过“上传资料”加入知识。</p>}
    <div className="library-pagination"><button disabled={offset===0} onClick={()=>setOffset(value=>Math.max(0,value-50))}>上一页</button><span>第 {offset/50+1} 页</span><button disabled={!more} onClick={()=>setOffset(value=>value+50)}>下一页</button></div>
    </>}
  </section>;
}
