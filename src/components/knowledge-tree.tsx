"use client";
import {useEffect,useRef,useState} from "react";
import { RawJsonDetails } from "./raw-json-details";

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
  return <TreeReader key={documentId} documentId={documentId}/>;
}
function TreeReader({documentId}:{documentId:string}){
  const [parentId,setParentId]=useState<string|null>(null),[unitTitle,setUnitTitle]=useState("");
  const [offset,setOffset]=useState(0),[nodes,setNodes]=useState<Node[]>([]),[hasMore,setHasMore]=useState(false);
  const [evidence,setEvidence]=useState<Evidence|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [revision,setRevision]=useState(0),[reading,setReading]=useState(false),[readError,setReadError]=useState("");
  const readId=useRef(0),readController=useRef<AbortController|undefined>(undefined),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;readController.current?.abort();};},[]);
  useEffect(()=>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);let active=true;
    const params=new URLSearchParams({documentId,offset:String(offset)});if(parentId)params.set("parentId",parentId);
    fetch(`/api/knowledge/tree?${params}`,{cache:"no-store",signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error("原文坐标读取失败");return response.json();})
      .then(data=>{
        if(!Array.isArray(data.nodes)||typeof data.hasMore!=="boolean"||!data.nodes.every((node:Node)=>node&&typeof node.id==="string"&&typeof node.title==="string"&&["unit","evidence"].includes(node.node_kind)&&node.source_location&&typeof node.source_location==="object"&&!Array.isArray(node.source_location)))throw Error("原文目录格式异常");
        if(active){setNodes(data.nodes);setHasMore(data.hasMore);setError("");}
      })
      .catch(()=>{if(active){setNodes([]);setHasMore(false);setError("原文坐标读取失败，请重试。");}})
      .finally(()=>{clearTimeout(timeout);if(active)setLoading(false);});
    return()=>{active=false;clearTimeout(timeout);controller.abort();};
  },[documentId,parentId,offset,revision]);
  function startDirectory(){
    readId.current++;readController.current?.abort();
    setEvidence(null);setReadError("");setReading(false);setNodes([]);setHasMore(false);setError("");setLoading(true);
  }
  async function read(node:Node){
    if(loading||error)return;
    const id=++readId.current;readController.current?.abort();
    const controller=new AbortController();readController.current=controller;const timeout=setTimeout(()=>controller.abort(),10000);
    setReadError("");setEvidence(null);setReading(true);
    try{const params=new URLSearchParams({documentId,nodeId:node.id});
      const response=await fetch(`/api/knowledge/tree?${params}`,{cache:"no-store",signal:controller.signal});
      if(!response.ok)throw new Error("原文已失效或无权读取");
      const data=await response.json() as {evidence:Evidence};
      if(!data.evidence||data.evidence.id!==node.id||typeof data.evidence.content!=="string"||typeof data.evidence.source_sha256!=="string"||!data.evidence.source_location||typeof data.evidence.source_location!=="object"||Array.isArray(data.evidence.source_location))throw Error("原文格式异常");
      if(alive.current&&id===readId.current)setEvidence(data.evidence);
    }catch{if(alive.current&&id===readId.current)setReadError("原文读取失败，来源可能已失效或暂时不可用。请重新选择原文核对。");}
    finally{clearTimeout(timeout);if(alive.current&&id===readId.current)setReading(false);}
  }
  return <section className="knowledge-tree" aria-label="原文坐标">
    <div className="knowledge-tree-heading"><h3>原文与坐标</h3>{parentId&&<button type="button" onClick={()=>{startDirectory();setParentId(null);setUnitTitle("");setOffset(0);}}>返回目录</button>}</div>
    {unitTitle&&<p className="subtle">{unitTitle}</p>}
    {error&&<p role="alert">{error}<button type="button" onClick={()=>{startDirectory();setRevision(value=>value+1);}}>重试读取目录</button></p>}{loading&&<p role="status">正在读取目录…</p>}
    {reading&&<p role="status">正在读取原文…</p>}{readError&&<p role="alert">{readError}</p>}
    {!loading&&!error&&!nodes.length&&<p>这份资料尚无可检索的原文树。</p>}
    <div className="knowledge-tree-list">{!loading&&!error&&nodes.map(node=><button type="button" key={node.id} onClick={()=>node.node_kind==="unit"?
      (startDirectory(),setParentId(node.id),setUnitTitle(node.title),setOffset(0)):void read(node)}>
      <strong>{node.title}</strong><small>{coordinate(node.source_location)}</small></button>)}</div>
    {(offset>0||hasMore)&&<div className="library-pagination"><button type="button" disabled={loading||offset===0} onClick={()=>{startDirectory();setOffset(Math.max(0,offset-20));}}>上一页</button>
      <span>第 {offset/20+1} 页</span><button type="button" disabled={loading||Boolean(error)||!hasMore} onClick={()=>{startDirectory();setOffset(offset+20);}}>下一页</button></div>}
    {evidence&&<div className="knowledge-tree-evidence"><strong>{coordinate(evidence.source_location)}</strong><pre>{evidence.content}</pre>
      <RawJsonDetails summary="完整来源坐标" value={evidence.source_location}/><small>来源 SHA-256：{evidence.source_sha256}</small></div>}
  </section>;
}
