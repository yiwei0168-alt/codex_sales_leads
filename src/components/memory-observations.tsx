"use client";
import {useEffect,useState} from "react";

type View="current"|"timeline"|"conflicts"|"notices";
type Item={id?:string;observation_id?:string;kind?:string;content?:string;recorded_at?:string;valid_from?:string|null;valid_until?:string|null;
  source_receipt?:Record<string,unknown>;invalidates_id?:string|null;is_invalidated?:boolean;earlier_content?:string;later_content?:string;created_at?:string;read_at?:string|null};
const labels:Record<View,string>={current:"当前有效",timeline:"历史时间轴",conflicts:"冲突待处理",notices:"学习通知"};

export function MemoryObservations(){
  const [view,setView]=useState<View>("current"),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
  const [items,setItems]=useState<Item[]>([]),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(true);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`/api/knowledge/observations?view=${view}&offset=${offset}`,{cache:"no-store",signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error("读取失败");return response.json();})
      .then(data=>{if(controller.signal.aborted)return;setItems(data.items);setHasMore(data.hasMore);setError("");setLoading(false);})
      .catch(()=>{if(!controller.signal.aborted){setError("记忆观察读取失败，请重试");setLoading(false);}});
    return()=>controller.abort();
  },[view,offset,revision]);
  function changeView(next:View){setView(next);setOffset(0);setLoading(true);setItems([]);}
  async function undo(id:string){
    setBusy(true);try{
      const response=await fetch("/api/knowledge/observations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"undo",id})});
      if(!response.ok)throw new Error("撤销失败，请刷新后重试");
      setRevision(value=>value+1);
    }catch(error){setError(error instanceof Error?error.message:"撤销失败");}finally{setBusy(false);}
  }
  return <section className="panel" aria-label="学习记忆">
    <h3>学习记忆</h3><p>带来源的内部工作记忆。业务生效时间未知的记录保留在历史时间轴；正式事实仍需核验。</p>
    <nav className="knowledge-material-nav" aria-label="学习记忆分区">{(Object.keys(labels) as View[]).map(key=><button key={key} type="button" aria-current={view===key?"page":undefined} onClick={()=>changeView(key)}>{labels[key]}</button>)}</nav>
    {loading&&<p>正在读取…</p>}{error&&<p role="alert">{error}</p>}
    {!loading&&!error&&!items.length&&<p>当前分区暂无记录。</p>}
    {items.map((item,index)=><article className="opportunity-card" key={item.id??item.observation_id??index}>
      {view==="conflicts"?<><strong>待核对的两条记忆</strong><p>{item.earlier_content}</p><p>{item.later_content}</p></>
        :<><strong>{item.kind??"记忆观察"}</strong><p style={{whiteSpace:"pre-wrap"}}>{item.content}</p>
          <small>{item.recorded_at??item.created_at}{item.valid_from?` · 业务生效 ${item.valid_from}`:" · 业务生效时间未知"}</small>
          {item.source_receipt&&<details><summary>来源收据</summary><pre>{JSON.stringify(item.source_receipt,null,2)}</pre></details>}
          {item.id&&!item.invalidates_id&&!item.is_invalidated&&view!=="notices"&&<button type="button" disabled={busy} onClick={()=>void undo(item.id!)}>撤销这条记忆</button>}</>}
    </article>)}
    <div><button type="button" disabled={loading||offset===0} onClick={()=>{setOffset(Math.max(0,offset-12));setLoading(true);}}>上一页</button><span>第 {offset/12+1} 页</span><button type="button" disabled={loading||!hasMore} onClick={()=>{setOffset(offset+12);setLoading(true);}}>下一页</button></div>
  </section>;
}
