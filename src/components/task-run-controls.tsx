"use client";
import { useEffect,useState } from "react";
import { useRouter } from "next/navigation";
type State={job:{status:string;phase:string;attempts:number;stop_requested:boolean;paused_at:string|null}|null;progress:Record<string,unknown>|null};
export function TaskRunControls({actionId,status}:{actionId:string;status:string}){
  const router=useRouter();const [state,setState]=useState<State|null>(null);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [revision,setRevision]=useState(0);
  useEffect(()=>{const controller=new AbortController();let pending=false;let terminal=false;
    async function read(){if(pending||document.hidden||terminal)return;pending=true;try{const response=await fetch(`/api/assistant/actions/${actionId}/progress`,{signal:controller.signal,cache:"no-store"});if(!response.ok)throw new Error();const data=await response.json();if(!controller.signal.aborted){setState(data);terminal=!data.job||!["queued","running"].includes(data.job.status);}}catch{if(!controller.signal.aborted)setMessage("进度读取失败，可刷新重试");}finally{pending=false;}}
    void read();const timer=window.setInterval(()=>void read(),10000);return()=>{controller.abort();window.clearInterval(timer);};
  },[actionId,revision]);
  async function action(pause:boolean){if(busy)return;setBusy(true);setMessage("");try{const response=await fetch(`/api/assistant/actions/${actionId}/${pause?"progress":"confirm"}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:pause?"pause":"resume"})});const body=await response.json();if(!response.ok)throw new Error(body.error);setMessage(pause?"已请求暂停：当前阶段会完成并保存，随后不再启动下一阶段。":"任务已恢复，可在任务中心跟踪。");router.refresh();}catch(error){setMessage(String(error));}finally{setBusy(false);setRevision(value=>value+1);}}
  const paused=Boolean(state?.job?.paused_at&&state.job.stop_requested);
  return <section><p>阶段：{state?.job?.phase??"尚未执行"} · 执行次数 {state?.job?.attempts??0}{paused?" · 已暂停":state?.job?.stop_requested?" · 等待阶段边界暂停":""}</p>
    {status==='proposed'&&!state?.job&&<button disabled={busy||!state} onClick={()=>{if(window.confirm('确认当前国家、角色和目标数量，并允许按预算门禁执行模型与搜索调用？'))void action(false);}}>确认计划及费用并开始</button>}
    {state?.job&&["queued","running"].includes(state.job.status)&&<button disabled={busy||state.job.stop_requested} onClick={()=>void action(true)}>在下一安全节点暂停</button>}
    {(paused||status==="failed"||state?.job?.status==="failed")&&<button disabled={busy} onClick={()=>{if(window.confirm("从已保存阶段恢复，后续模型和搜索可能产生费用。是否确认继续？"))void action(false);}}>确认费用并从检查点恢复</button>}
    {message&&<p role="status">{message}</p>}
    <details><summary>阶段成本与数量记录（已保存检查点）</summary><p>当前阶段尚未保存的调用不在这里；未知费用不按零计算。请求暂停不会中断正在计费的调用。</p><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{state?.progress?JSON.stringify(state.progress,null,2):"尚无检查点记录"}</pre></details>
  </section>;
}
