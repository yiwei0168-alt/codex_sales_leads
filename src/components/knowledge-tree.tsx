"use client";
import {useEffect,useState} from "react";

type Node={id:string;title:string;node_kind:"unit"|"evidence";unit_type:string;unit_index:number;source_location:Record<string,unknown>};
type Evidence={id:string;content:string;source_location:Record<string,unknown>;source_sha256:string};
function coordinate(location:Record<string,unknown>){
  const unit=location.unitType==="page"?`第 ${location.unitIndex} 页`:location.unitType==="slide"?`第 ${location.unitIndex} 张幻灯片`:
    location.unitType==="sheet"?`工作表 ${location.sheetName??location.unitIndex}`:"正文";
  const row=location.rowStart?`，第 ${location.rowStart}${location.rowEnd&&location.rowEnd!==location.rowStart?`–${location.rowEnd}`:""} 行`:"";
  const block=location.blockId?`，块 ${location.blockId}`:location.v3ChunkId?`，抽取块 ${String(location.v3ChunkId).slice(0,8)}`:"";
  return `${unit}${row}${block}`;
}
export function KnowledgeTree({documentId}:{documentId:string}){
  const [parentId,setParentId]=useState<string|null>(null),[unitTitle,setUnitTitle]=useState("");
  const [offset,setOffset]=useState(0),[nodes,setNodes]=useState<Node[]>([]),[hasMore,setHasMore]=useState(false);
  const [evidence,setEvidence]=useState<Evidence|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    const params=new URLSearchParams({documentId,offset:String(offset)});if(parentId)params.set("parentId",parentId);
    fetch(`/api/knowledge/tree?${params}`,{cache:"no-store",signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error("原文坐标读取失败");return response.json();})
      .then(data=>{if(controller.signal.aborted)return;setNodes(data.nodes??[]);setHasMore(Boolean(data.hasMore));setError("");setLoading(false);})
      .catch(reason=>{if(!controller.signal.aborted){setError(reason instanceof Error?reason.message:"原文坐标读取失败");setLoading(false);}});
    return()=>controller.abort();
  },[documentId,parentId,offset]);
  async function read(node:Node){
    setError("");setEvidence(null);
    try{const params=new URLSearchParams({documentId,nodeId:node.id});
      const response=await fetch(`/api/knowledge/tree?${params}`,{cache:"no-store"});
      if(!response.ok)throw new Error("原文已失效或无权读取");
      const data=await response.json() as {evidence:Evidence};setEvidence(data.evidence);
    }catch(reason){setError(reason instanceof Error?reason.message:"原文读取失败");}
  }
  return <section className="knowledge-tree" aria-label="原文坐标">
    <div className="knowledge-tree-heading"><h3>原文与坐标</h3>{parentId&&<button type="button" onClick={()=>{setParentId(null);setUnitTitle("");setOffset(0);setEvidence(null);setLoading(true);}}>返回目录</button>}</div>
    {unitTitle&&<p className="subtle">{unitTitle}</p>}
    {error&&<p role="alert">{error}</p>}{loading&&<p>正在读取目录…</p>}
    {!loading&&!error&&!nodes.length&&<p>这份资料尚无可检索的原文树。</p>}
    <div className="knowledge-tree-list">{nodes.map(node=><button type="button" key={node.id} onClick={()=>node.node_kind==="unit"?
      (setParentId(node.id),setUnitTitle(node.title),setOffset(0),setEvidence(null),setLoading(true)):void read(node)}>
      <strong>{node.title}</strong><small>{coordinate(node.source_location)}</small></button>)}</div>
    {(offset>0||hasMore)&&<div className="library-pagination"><button type="button" disabled={loading||offset===0} onClick={()=>{setOffset(Math.max(0,offset-20));setLoading(true);}}>上一页</button>
      <span>第 {offset/20+1} 页</span><button type="button" disabled={loading||!hasMore} onClick={()=>{setOffset(offset+20);setLoading(true);}}>下一页</button></div>}
    {evidence&&<div className="knowledge-tree-evidence"><strong>{coordinate(evidence.source_location)}</strong><pre>{evidence.content}</pre>
      <details><summary>完整来源坐标</summary><code>{JSON.stringify(evidence.source_location)}</code><small>来源 SHA-256：{evidence.source_sha256}</small></details></div>}
  </section>;
}
