"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { RunStatus } from "@/lib/assistant/main/contracts";
const labels:Record<RunStatus,string>={queued:"排队中",running:"执行中",waiting_user:"等待确认",paused:"已暂停",partial:"部分完成",completed:"已完成",failed:"失败",cancelled:"已取消"};
type Entry={id:string;conversation_id:string;status:RunStatus;title?:string};
export function AgentTaskHistory(){
  const [items,setItems]=useState<Entry[]>([]),[error,setError]=useState(""),[version,setVersion]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let pending=false;
    async function load(){if(pending)return;pending=true;try{
      const response=await fetch("/api/assistant/runs",{signal:controller.signal,cache:"no-store"});if(!response.ok)throw Error("对话任务读取失败");
      const data=await response.json();if(!controller.signal.aborted){setItems(data.runs);setError("");}
    }catch{if(!controller.signal.aborted)setError("对话任务读取失败，请重试");}finally{pending=false;}}
    void load();const timer=setInterval(()=>{if(!document.hidden)void load();},5000);
    return()=>{controller.abort();clearInterval(timer);};
  },[version]);
  return <section className="agent-task-history"><h2>最近对话任务</h2><p>显示最近 50 项任务，状态与对应对话一致。返回对话查看完整回执或核对待批准内容。</p>{error&&<p role="alert">{error}<button onClick={()=>setVersion(value=>value+1)}>重试</button></p>}{items.map(item=><article key={item.id}><Link href={`/c/${item.conversation_id}`}>{item.title??`对话任务 ${item.id.slice(0,8)}`}</Link><span>{labels[item.status]}</span></article>)}{!error&&!items.length&&<p>暂无对话任务。</p>}</section>;
}
