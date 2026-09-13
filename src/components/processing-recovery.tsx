"use client";
import {useState} from "react";
export function ProcessingRecovery({actionId,existingChild}:{actionId:string;existingChild?:string}){
  const [child,setChild]=useState(existingChild??""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function propose(){
    setBusy(true);setError("");
    try{
      const response=await fetch(`/api/assistant/actions/${encodeURIComponent(actionId)}/recover`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({propose:true})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);setChild(result.actionId);
    }catch(error){setError(error instanceof Error?error.message:"恢复提案创建失败");}finally{setBusy(false);}
  }
  return <section aria-label="原范围处理恢复">
    <p>仅恢复原范围内未完成的公司，按需补证，不新增公司搜索。原结果与费用保留，恢复继续受原任务预算约束。</p>
    {!child&&<button disabled={busy} onClick={()=>void propose()}>{busy?"正在核对恢复范围…":"准备缺项恢复计划（不执行）"}</button>}
    {child&&<a href={`/tasks/${encodeURIComponent(child)}?kind=search`}>审阅恢复计划、共享预算并确认执行</a>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
