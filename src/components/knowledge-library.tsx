"use client";
import {useEffect,useRef,useState} from "react";
import {SavedKnowledgeText} from "./saved-knowledge-text";
import {KnowledgeRevisions} from "./knowledge-revisions";
import {KnowledgeTree} from "./knowledge-tree";

type Item={id:string;title:string;sourceUrl?:string|null;assetId?:string|null;documentType?:string;version?:string;updatedAt:string;status:string;scope:string;excerpt?:string|null;
  contentAvailable:boolean;treeStatus?:"searchable"|"pending"|"unavailable";treeVersionId?:string|null;sourceSha256?:string|null};
const PAGE_SIZE=12;
function SourceLinks({item}:{item:Item}){return <div className="library-links">{item.assetId&&<a href={`/api/knowledge/assets/${item.assetId}`} target="_blank" rel="noreferrer">打开原始资料</a>}{item.sourceUrl&&/^https?:\/\//i.test(item.sourceUrl)&&<a href={item.sourceUrl} target="_blank" rel="noreferrer">查看来源</a>}</div>;}
function TreeStatus({item}:{item:Item}){return item.treeStatus?<p className="subtle">{item.treeStatus==="searchable"?"可检索":item.treeStatus==="pending"?"待建立索引":"来源或版本已失效"}{item.treeVersionId?` · 树版本 ${item.treeVersionId.slice(0,8)}`:""}{item.sourceSha256?` · 来源 ${item.sourceSha256.slice(0,8)}`:""}</p>:null;}

function LibraryReader({item,onBack}:{item:Item;onBack:()=>void}){
  const [saved,setSaved]=useState<(Item&{content:string|null})|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);let active=true;
    void fetch(`/api/knowledge/library/${item.id}?scope=${item.scope==="public-evidence"?"evidence":item.scope}`,{signal:controller.signal,cache:"no-store"})
      .then(async response=>{if(!response.ok)throw Error();const body=await response.json();
        if(!body.item||body.item.id!==item.id||typeof body.item.title!=="string"||(body.item.content!==null&&typeof body.item.content!=="string"))throw Error();
        if(active){setSaved({...item,...body.item,contentAvailable:true});setError("");}
      }).catch(()=>{if(active){setSaved(null);setError("当前资料读取失败，来源可能已失效或暂时不可用。请重试核对。");}})
      .finally(()=>{clearTimeout(timeout);if(active)setLoading(false);});
    return()=>{active=false;clearTimeout(timeout);controller.abort();};
  },[item,revision]);
  function refresh(){setSaved(null);setLoading(true);setError("");setRevision(value=>value+1);}
  return <article className="library-reader">
    <button className="secondary-button" onClick={onBack}>返回资料列表</button><h2>{saved?.title??item.title}</h2>
    <button type="button" disabled={loading} onClick={refresh}>刷新当前资料</button>
    {item.scope==="private"&&<><p className="subtle">历史版本仅供追溯，不表示当前来源仍可用。</p><KnowledgeRevisions documentId={item.id}/></>}
    {loading&&<p role="status">正在读取资料…</p>}
    {error&&<p role="alert">{error}<button type="button" onClick={refresh}>重试读取资料</button></p>}
    {saved&&!loading&&!error&&<><SourceLinks item={saved}/><TreeStatus item={saved}/>
      {saved.scope!=="public-evidence"&&<KnowledgeTree key={`${saved.id}:${revision}`} documentId={saved.id}/>}
      <details className="knowledge-legacy-text"><summary>查看已保存的检索正文</summary><p className="subtle">检索片段可能含重叠内容；原始排版请查看原始资料。</p><div className="library-body">{saved.content?<SavedKnowledgeText text={saved.content}/>:<p>暂无已保存正文，请查看当前可用原文。</p>}</div></details>
    </>}
  </article>;
}

export function KnowledgeLibrary(){
  const [selected,setSelected]=useState<Item|null>(null),[scope,setScope]=useState("private"),[query,setQuery]=useState("");
  const [filter,setFilter]=useState(""),[offset,setOffset]=useState(0),[items,setItems]=useState<Item[]>([]),[more,setMore]=useState(false);
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[revision,setRevision]=useState(0);
  const [deletingId,setDeletingId]=useState<string|null>(null),[notice,setNotice]=useState(""),[deleteError,setDeleteError]=useState("");
  const epoch=useRef(0),deleteLock=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000),current=epoch.current;let active=true;
    void fetch(`/api/knowledge/library?${new URLSearchParams({scope,q:filter,offset:String(offset)})}`,{signal:controller.signal,cache:"no-store"})
      .then(async response=>{if(!response.ok)throw Error();const data=await response.json();
        if(!Array.isArray(data.items)||typeof data.hasMore!=="boolean"||!data.items.every((item:Item)=>item&&typeof item.id==="string"&&typeof item.title==="string"&&["private","shared","public-evidence"].includes(item.scope)&&typeof item.contentAvailable==="boolean"))throw Error();
        if(active&&current===epoch.current){setItems(data.items);setMore(data.hasMore);setError("");}
      }).catch(()=>{if(active&&current===epoch.current){setItems([]);setMore(false);setError("资料列表读取失败，请重试。");}})
      .finally(()=>{clearTimeout(timeout);if(active&&current===epoch.current)setLoading(false);});
    return()=>{active=false;clearTimeout(timeout);controller.abort();};
  },[scope,filter,offset,revision]);
  function startList(){epoch.current++;setItems([]);setMore(false);setError("");setLoading(true);}
  function refresh(){startList();setRevision(value=>value+1);}
  async function remove(item:Item){
    if(deleteLock.current||!window.confirm(`永久删除私有知识“${item.title}”及其检索片段？原始邮件不删除，此操作不可撤销。`))return;
    deleteLock.current=true;setDeletingId(item.id);setNotice("");setDeleteError("");
    try{
      const response=await fetch("/api/knowledge/library",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:item.id,confirmed:true}),signal:AbortSignal.timeout(10000)});
      const body=await response.json().catch(()=>null);if(!response.ok||body?.deleted!==true)throw Error();
      if(alive.current){setNotice("私有知识已删除，原始邮件未删除。");refresh();}
    }catch{if(alive.current)setDeleteError("未确认删除结果，资料可能已删除。请先刷新列表核对；系统不会自动重试删除。");}
    finally{deleteLock.current=false;if(alive.current)setDeletingId(null);}
  }
  const busy=loading||Boolean(deletingId);
  return <section className="knowledge-library" aria-label="资料列表">
    {selected?<LibraryReader key={selected.id} item={selected} onBack={()=>{setSelected(null);refresh();}}/>:<>
      <div className="library-toolbar"><label>范围<select aria-label="知识范围" disabled={Boolean(deletingId)} value={scope} onChange={event=>{startList();setScope(event.target.value);setOffset(0);}}><option value="all">全部</option><option value="private">我的私有知识</option><option value="shared">共享知识（只读）</option><option value="evidence">公共证据库（只读）</option></select></label>
        <form onSubmit={event=>{event.preventDefault();if(deleteLock.current)return;startList();setFilter(query);setOffset(0);setRevision(value=>value+1);}}><input aria-label="搜索资料" maxLength={200} disabled={Boolean(deletingId)} placeholder="搜索名称或证据网址" value={query} onChange={event=>setQuery(event.target.value)}/><button disabled={busy} className="secondary-button">搜索</button></form>
        <button disabled={busy} onClick={refresh}>刷新资料</button>
      </div>
      {notice&&<p role="status">{notice}</p>}{deleteError&&<p role="alert">{deleteError}</p>}
      {loading&&<p role="status">正在读取资料列表…</p>}
      {error&&<p role="alert">{error}<button type="button" disabled={busy} onClick={refresh}>重试读取列表</button></p>}
      <div className="library-list">{!loading&&!error&&items.map(item=><article className="library-row" key={item.id}><div>
        <button className="library-title" disabled={Boolean(deletingId)} onClick={()=>{if(!deleteLock.current)setSelected(item);}}>{item.title}</button>
        <p>{scope==="all"?`${item.scope==="private"?"我的私有知识":item.scope==="shared"?"共享知识":"公共证据库"} · `:""}{item.status} · {item.documentType??"已保存文本"}{item.version?` · ${item.version}`:""} · {item.updatedAt?.slice(0,10)}</p><TreeStatus item={item}/>
        <p className="library-excerpt">{item.contentAvailable?(item.excerpt??"无文本摘要"):"当前原文不可用；保留的历史内容不作为当前证据。"}</p>
        {item.contentAvailable&&<SourceLinks item={item}/>} {item.scope==="private"&&<KnowledgeRevisions documentId={item.id}/>}
      </div>{item.scope==="private"&&<button disabled={Boolean(deletingId)} className="text-button" onClick={()=>void remove(item)}>{deletingId===item.id?"正在删除…":"删除此私有知识"}</button>}</article>)}</div>
      {!loading&&!error&&!items.length&&<p className="empty-state">此范围暂无资料。可以调整筛选，或通过“上传资料”加入知识。</p>}
      <div className="library-pagination"><button disabled={busy||offset===0} onClick={()=>{startList();setOffset(value=>Math.max(0,value-PAGE_SIZE));}}>上一页</button><span>第 {offset/PAGE_SIZE+1} 页 · 每页 {PAGE_SIZE} 条</span><button disabled={busy||Boolean(error)||!more} onClick={()=>{startList();setOffset(value=>value+PAGE_SIZE);}}>下一页</button></div>
    </>}
  </section>;
}
