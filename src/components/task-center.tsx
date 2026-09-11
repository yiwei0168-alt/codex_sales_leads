"use client";
import { useEffect, useState } from "react";
import type { AssistantActionDto } from "@/lib/assistant/types";
import { taskCounts, taskStatusLabels } from "@/lib/assistant/task-summary";
import { ContactEnrichmentProgress } from "./contact-enrichment-progress";

export function TaskCenter() {
  const [actions,setActions]=useState<AssistantActionDto[]>([]);
  const [offset,setOffset]=useState(0);const [hasMore,setHasMore]=useState(false);
  const [revision,setRevision]=useState(0);const [error,setError]=useState("");const [loading,setLoading]=useState(true);
  const [country,setCountry]=useState("all");const [status,setStatus]=useState("all");const [contacts,setContacts]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    async function load(){
      try {
        const response=await fetch(`/api/assistant/actions?offset=${offset}`,{signal:controller.signal,cache:"no-store"});
        if(!response.ok)throw new Error("任务列表读取失败，请重试");
        const data=await response.json() as {actions:AssistantActionDto[];hasMore:boolean};
        if(controller.signal.aborted)return;
        setActions(data.actions);setHasMore(data.hasMore);setLoading(false);setError("");
        if(data.actions.some(item=>["running","confirmed"].includes(item.status)))timer=setTimeout(()=>{if(document.visibilityState==="visible")void load();},5000);
      }catch {if(!controller.signal.aborted){setError("任务列表读取失败，请重试");setLoading(false);}}
    }
    function visible(){if(document.visibilityState==="visible"){if(timer)clearTimeout(timer);void load();}}
    document.addEventListener("visibilitychange",visible);
    void load();return()=>{controller.abort();if(timer)clearTimeout(timer);document.removeEventListener("visibilitychange",visible);};
  },[offset,revision]);
  function page(next:number){setLoading(true);setActions([]);setOffset(next);setCountry("all");setStatus("all");}
  const shown=actions.filter(item=>(country==="all"||item.payload.countryCode===country)&&(status==="all"||item.status===status));
  return <section className="panel"><h2>任务中心</h2>
    <p>销售线索搜索任务 · 每页 50 条，筛选当前页。查看不会启动或重试付费任务。</p>
    <button onClick={()=>setRevision(value=>value+1)}>刷新</button>
    <label>国家<select value={country} onChange={event=>setCountry(event.target.value)}><option value="all">当前页全部国家</option>{[...new Set(actions.map(item=>item.payload.countryCode))].sort().map(code=><option key={code}>{code}</option>)}</select></label>
    <label>状态<select value={status} onChange={event=>setStatus(event.target.value)}><option value="all">全部状态</option>{Object.entries(taskStatusLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    {error&&<p role="alert">{error}</p>}{loading&&<p>正在读取任务…</p>}
    {!loading&&!error&&shown.length===0&&<p>暂无匹配任务。</p>}
    {shown.map(item=><article key={item.id} className="opportunity-card"><a href={`/tasks/${item.id}`}>{item.payload.countryName} · {item.payload.roles.join(" / ")}</a>
      <p>{taskStatusLabels[item.status]} · 保存 {taskCounts(item.result).accepted??"待记录"} / 目标 {item.payload.targetCount} 家</p><small>{item.updatedAt}</small></article>)}
    <button disabled={offset===0||loading} onClick={()=>page(Math.max(0,offset-50))}>上一页</button><span> 第 {offset/50+1} 页 </span><button disabled={!hasMore||loading} onClick={()=>page(offset+50)}>下一页</button>
    <details onToggle={event=>setContacts(event.currentTarget.open)}><summary>最近一次联系人补充任务</summary>{contacts&&<ContactEnrichmentProgress/>}</details>
  </section>;
}
