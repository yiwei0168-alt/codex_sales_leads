"use client";
import { useEffect,useState } from "react";
import type { AssistantActionDto } from "@/lib/assistant/types";
import { SearchTaskDetail } from "./search-task-detail";
export function TaskDetailView({id,kind,onClose}:{id:string;kind:string;onClose?:()=>void}){
  const [result,setResult]=useState<{kind:string;action?:AssistantActionDto;details:Record<string,unknown>}|null>(null);
  const [error,setError]=useState("");const [revision,setRevision]=useState(0);
  const [offset,setOffset]=useState(0);
  useEffect(()=>{const controller=new AbortController();fetch(`/api/tasks/${encodeURIComponent(id)}?kind=${encodeURIComponent(kind)}&offset=${offset}`,{signal:controller.signal,cache:"no-store"})
    .then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(data=>{if(!controller.signal.aborted){setResult(data);setError("");}}).catch(()=>{if(!controller.signal.aborted)setError("详情读取失败或无权访问，可重试");});return()=>controller.abort();},[id,kind,revision,offset]);
  const content=<><header><h2>任务详情</h2><button onClick={()=>setRevision(value=>value+1)}>刷新</button>{onClose&&<><a href={`/tasks/${id}?kind=${kind}`}>打开独立页面</a><button onClick={onClose}>关闭</button></>}</header>{error&&<p role="alert">{error}</p>}{!result&&!error&&<p>正在读取…</p>}
    {result?.action&&<SearchTaskDetail action={result.action}/>}{result&&<details open={!result.action}><summary>{result.action?"本次评分候选与排除原因（每页50家）":"记录、产出与成本详情"}</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(result.details,null,2)}</pre></details>}{["search","contacts"].includes(kind)&&<p>第 {offset/50+1} 页 <button disabled={!offset} onClick={()=>{setResult(null);setOffset(value=>Math.max(0,value-50));}}>上一页</button><button disabled={!result?.details.hasMore} onClick={()=>{setResult(null);setOffset(value=>value+50);}}>下一页</button></p>}<p>这是已保存记录，不重新搜索或生成。草稿批准不等于发送，服务器接受不等于送达或已读。</p></>;
  return onClose?<div className="drawer-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><aside className="company-drawer" role="dialog" aria-modal="true" aria-label="任务详情"><div className="drawer-body">{content}</div></aside></div>:<section className="panel">{content}</section>;
}
