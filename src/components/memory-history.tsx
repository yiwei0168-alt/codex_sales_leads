"use client";
import { useEffect,useState } from "react";
type Entry={id:string;memoryId:string;operation:string;changedFields:string[];beforeState:Record<string,unknown>|null;afterState:Record<string,unknown>|null;createdAt:string};
const fields:Record<string,string>={title:"标题",content:"正文",kind:"类型",status:"状态",usage_scope:"对外授权",market_codes:"国家范围",channel_roles:"角色范围",context:"来源上下文",embedding:"检索向量",INSERT:"新增",DELETE:"删除"};
export function MemoryHistory(){
  const [items,setItems]=useState<Entry[]>([]);const [offset,setOffset]=useState(0);const [more,setMore]=useState(false);const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);const [revision,setRevision]=useState(0);
  useEffect(()=>{const controller=new AbortController();
    fetch(`/api/knowledge/memories/history?offset=${offset}`,{cache:"no-store",signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error();const data=await response.json();if(controller.signal.aborted)return;
      setItems(data.items);setMore(data.hasMore);setLoading(false);setError("");
    }).catch(()=>{if(!controller.signal.aborted){setError("历史记录读取失败，请重试");setLoading(false);}});return()=>controller.abort();
  },[offset,revision]);
  function page(value:number){setItems([]);setLoading(true);setOffset(value);}
  return <section><p>记录审计功能启用后的变更。为避免重复保留已删除正文，只记录字段变化、状态和范围，不保存历史正文，不支持回滚。</p>
    <button onClick={()=>setRevision(value=>value+1)}>刷新历史</button>{error&&<p role="alert">{error}</p>}{loading&&<p>正在读取…</p>}
    {!loading&&!error&&items.length===0&&<p>暂无变更记录。</p>}
    {items.map(item=><article key={item.id}><p>{item.createdAt} · {item.operation==="INSERT"?"新增":item.operation==="DELETE"?"删除":"修改"} · 记忆 {item.memoryId.slice(0,8)}</p><p>{item.changedFields.map(key=>fields[key]??key).join("、")}</p>
      <details><summary>状态与范围快照</summary><pre style={{whiteSpace:"pre-wrap"}}>{JSON.stringify({before:item.beforeState,after:item.afterState},null,2)}</pre></details></article>)}
    <button disabled={loading||offset===0} onClick={()=>page(Math.max(0,offset-50))}>上一页</button><span>第 {offset/50+1} 页</span><button disabled={loading||!more} onClick={()=>page(offset+50)}>下一页</button>
  </section>;
}
