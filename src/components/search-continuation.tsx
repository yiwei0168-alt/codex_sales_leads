"use client";
import { useState } from 'react';
export function SearchContinuation({actionId}:{actionId:string}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[child,setChild]=useState('');
  async function propose(){
    setBusy(true);setError('');try{const response=await fetch(`/api/assistant/actions/${encodeURIComponent(actionId)}/continue`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({propose:true})});
      const data=await response.json();if(!response.ok)throw new Error(data.error);setChild(data.actionId);
    }catch(error){setError(error instanceof Error?error.message:'无法创建续搜提案');}finally{setBusy(false);}
  }
  return <section><button disabled={busy||Boolean(child)} onClick={()=>void propose()}>建立缺口续搜计划（不执行）</button>
    {error&&<p role="alert">{error}</p>}{child&&<p>原任务未重跑，续搜尚未执行。<a href={`/tasks/${encodeURIComponent(child)}?kind=search`}>审阅续搜计划并确认费用</a></p>}
    <p>排除前序已评估公司；沿用原国家和角色，按当前产品评分机制执行。最多三次续搜，已确认停滞时需重新规划。</p></section>;
}
