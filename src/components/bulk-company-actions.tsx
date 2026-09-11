"use client";
import { useState } from "react";
import type { CompanyRecord } from "@/lib/domain";
import type { CompanyEditablePatch } from "@/lib/sales/types";
import { opportunityStages } from "@/lib/sales/opportunity-stages";

export function BulkCompanyActions({companies,onUpdate}:{companies:CompanyRecord[];onUpdate:(id:string,patch:CompanyEditablePatch)=>Promise<boolean>}) {
  const [selected,setSelected]=useState<string[]>([]);
  const [stage,setStage]=useState<CompanyRecord["opportunityStage"]>("Qualified");
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const ids=selected.filter(id=>companies.some(company=>company.id===id));
  async function apply(){
    if(busy||!ids.length)return;
    setBusy(true);let completed=0;const failed:string[]=[];
    try{for(const id of ids){if(await onUpdate(id,{opportunityStage:stage}))completed++;else failed.push(id);}
      setSelected(failed);setMessage(`已保存 ${completed} 家${failed.length?`，失败 ${failed.length} 家保留勾选，可重试`:""}。`);
    }finally{setBusy(false);}
  }
  return <details className="panel"><summary>批量管理 · 已选 {ids.length} 家</summary>
    <p>仅修改开发阶段，不删除公司、证据或邮件。筛选外的公司不会被操作。</p>
    <div className="results-toolbar"><button disabled={busy} onClick={()=>setSelected(companies.map(company=>company.id))}>全选当前筛选</button><button disabled={busy} onClick={()=>setSelected([])}>清空选择</button>
      <select disabled={busy} aria-label="批量开发阶段" value={stage} onChange={event=>setStage(event.target.value as CompanyRecord["opportunityStage"])}>
        {opportunityStages.map(([value,label])=><option key={value} value={value}>{label}</option>)}<option value="Discovered">移出开发名单</option>
      </select><button disabled={busy||!ids.length} onClick={()=>void apply()}>{busy?"正在逐项保存…":`应用到 ${ids.length} 家`}</button></div>
    <div style={{maxHeight:180,overflow:"auto"}}>{companies.map(company=><label key={company.id} style={{display:"block"}}><input type="checkbox" disabled={busy} checked={ids.includes(company.id)} onChange={event=>setSelected(items=>event.target.checked?[...items,company.id]:items.filter(id=>id!==company.id))}/>{company.displayName}</label>)}</div>
    {message&&<p role="status">{message}</p>}
  </details>;
}
