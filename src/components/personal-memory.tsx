"use client";
import { useEffect,useState } from "react";
import type { MemoryItem } from "@/lib/outreach/memory-management";
import { MemoryEditor } from "./memory-editor";
const kinds:Record<string,string>={"email-style":"邮件风格","cooperation-path-preference":"合作路径偏好","user-approved-marketing-claim":"用户确认业务信息","company-classification":"公司事实/关系记录"};
export function PersonalMemory(){
  const [editing,setEditing]=useState<MemoryItem|"new"|null>(null);
  const [items,setItems]=useState<MemoryItem[]>([]);const [offset,setOffset]=useState(0);const [hasMore,setHasMore]=useState(false);
  const [revision,setRevision]=useState(0);const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true);
  const [pending,setPending]=useState<{item:MemoryItem;operation:"activate"|"archive"|"delete"}|null>(null);
  useEffect(()=>{const controller=new AbortController();
    fetch(`/api/knowledge/memories?offset=${offset}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{
      if(!response.ok)throw new Error();const data=await response.json();if(controller.signal.aborted)return;
      setItems(data.items);setHasMore(data.hasMore);setError("");setLoading(false);
    }).catch(()=>{if(!controller.signal.aborted){setError("个人记忆读取失败，请刷新");setLoading(false);}});
    return()=>controller.abort();
  },[offset,revision]);
  async function apply(){if(!pending)return;setBusy(true);try{
    const response=await fetch("/api/knowledge/memories",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:pending.item.id,operation:pending.operation,confirmed:true})});
    if(!response.ok){const data=await response.json();throw new Error(data.error);}
    setPending(null);setRevision(value=>value+1);
  }catch(error){setError(error instanceof Error?error.message:"操作失败");}finally{setBusy(false);}}
  function page(next:number){setLoading(true);setItems([]);setPending(null);setOffset(next);}
  return <section className="panel"><h2>个人长期记忆</h2><p>仅本人可见，与通用知识库隔离。停用/删除影响后续学习检索，不撤销公司当前分类、关系或已生成邮件。已开始的任务可能仍持有旧上下文。</p>
    <button disabled={busy} onClick={()=>{setEditing("new");setPending(null);}}>新增个人记忆</button>
    {editing&&<MemoryEditor key={editing==="new"?"new":editing.id} item={editing==="new"?undefined:editing} onCancel={()=>setEditing(null)} onSaved={()=>{setEditing(null);setRevision(value=>value+1);}}/>}
    <button disabled={busy} onClick={()=>setRevision(value=>value+1)}>刷新记忆</button>{error&&<p role="alert">{error}</p>}{loading&&<p>正在读取…</p>}
    {!loading&&!error&&!items.length&&<p>当前页暂无长期记忆。</p>}
    {pending&&<div role="alert"><p>确认{pending.operation==="delete"?"删除":pending.operation==="archive"?"停用":"启用"}“{pending.item.title}”？{pending.operation==="delete"&&"记忆正文将删除，来源邮件和审计记录保留；此操作不能撤销。"}</p><button disabled={busy} onClick={()=>void apply()}>确认操作</button><button disabled={busy} onClick={()=>setPending(null)}>取消</button></div>}
    {items.map(item=><article className="opportunity-card" key={item.id}><h3>{item.title}</h3><p>{kinds[item.kind]??item.kind} · {item.status==="active"?"启用":"停用"} · {item.usageScope==="external-use-approved"?"已授权对外使用":"内部学习"}</p>
      <p>国家：{item.marketCodes.join(" / ")||"未限定"} · 角色：{item.channelRoles.join(" / ")||"未限定"}</p><small>{item.updatedAt}</small>
      <details><summary>查看记忆内容</summary><p style={{whiteSpace:"pre-wrap"}}>{item.content}</p></details>
      {["email-style","user-approved-marketing-claim"].includes(item.kind)&&<button disabled={busy} onClick={()=>{setEditing(item);setPending(null);}}>编辑内容与范围</button>}
      {item.kind==="company-classification"?<p>此项是当前公司事实镜像，请到公司详情或关系图维护。</p>:<><button disabled={busy} onClick={()=>setPending({item,operation:item.status==="active"?"archive":"activate"})}>{item.status==="active"?"停用":"启用"}</button><button disabled={busy} onClick={()=>setPending({item,operation:"delete"})}>删除记忆</button></>}
    </article>)}
    <button disabled={busy||loading||offset===0} onClick={()=>page(Math.max(0,offset-50))}>上一页</button><span>第 {offset/50+1} 页</span><button disabled={busy||loading||!hasMore} onClick={()=>page(offset+50)}>下一页</button>
  </section>;
}
