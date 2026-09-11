"use client";
import { useEffect,useState } from "react";
import type { AssistantActionDto } from "@/lib/assistant/types";
import { SearchTaskDetail } from "./search-task-detail";
import {TaskRecordSummary} from "./task-record-summary";
import {useDialogFocus} from "./use-dialog-focus";
export function TaskDetailView({id,kind,onClose}:{id:string;kind:string;onClose?:()=>void}){
  const dialogRef=useDialogFocus(onClose);
  const [result,setResult]=useState<{kind:string;action?:AssistantActionDto;details:Record<string,unknown>}|null>(null);
  const [error,setError]=useState("");const [revision,setRevision]=useState(0);
  const [offset,setOffset]=useState(0);
  const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  async function reconcile(){
    if(!window.confirm('请先核实服务商任务与额度。确认结束这个本地异常查询？不会撤销外部任务或退款；迟到结果不再入库。若需重新查询，必须另行主动发起并可能再次收费。'))return;
    setBusy(true);try{const response=await fetch(`/api/tasks/${encodeURIComponent(id)}/reconcile`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind,confirmed:true})});
      const data=await response.json();if(!response.ok)throw new Error(data.error);setNotice(data.message);setRevision(value=>value+1);
    }catch(error){setNotice(error instanceof Error?error.message:'核实操作失败');}finally{setBusy(false);}
  }
  useEffect(()=>{const controller=new AbortController();fetch(`/api/tasks/${encodeURIComponent(id)}?kind=${encodeURIComponent(kind)}&offset=${offset}`,{signal:controller.signal,cache:"no-store"})
    .then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(data=>{if(!controller.signal.aborted){setResult(data);setError("");}}).catch(()=>{if(!controller.signal.aborted)setError("详情读取失败或无权访问，可重试");});return()=>controller.abort();},[id,kind,revision,offset]);
  const content=<><header><h2>任务详情</h2><button onClick={()=>setRevision(value=>value+1)}>刷新</button>{onClose&&<><a href={`/tasks/${id}?kind=${kind}`}>打开独立页面</a><button onClick={onClose}>关闭</button></>}</header>{error&&<p role="alert">{error}</p>}{!result&&!error&&<p>正在读取…</p>}
    {notice&&<p role="status">{notice}</p>}{['contacts','relationship'].includes(kind)&&result?.details.can_reconcile===true&&<button disabled={busy} onClick={()=>void reconcile()}>核实并结束异常查询（不重试）</button>}
    {result?.action&&<SearchTaskDetail action={result.action}/>}{result&&<><TaskRecordSummary details={result.details}/><details><summary>技术记录（原始结构，按需展开）</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(result.details,null,2)}</pre></details></>}{["search","contacts"].includes(kind)&&<p>第 {offset/50+1} 页 <button disabled={!offset} onClick={()=>{setResult(null);setOffset(value=>Math.max(0,value-50));}}>上一页</button><button disabled={!result?.details.hasMore} onClick={()=>{setResult(null);setOffset(value=>value+50);}}>下一页</button></p>}<p>这是已保存记录，不重新搜索或生成。草稿批准不等于发送，服务器接受不等于送达或已读。</p></>;
  return onClose?<div className="drawer-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><aside ref={dialogRef} tabIndex={-1} className="company-drawer" role="dialog" aria-modal="true" aria-label="任务详情"><div className="drawer-body">{content}</div></aside></div>:<section className="panel">{content}</section>;
}
