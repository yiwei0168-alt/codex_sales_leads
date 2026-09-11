"use client";
import { useEffect, useState } from "react";
import { primaryRole, type CompanyRecord } from "@/lib/domain";
import type { RelationshipRecord } from "@/lib/sales/relationships";

const statusLabels: Record<string,string> = { pending:"待核实", "user-confirmed":"用户确认", "user-rejected":"用户否定", "evidence-supported":"证据支持" };

export function UserChannelMap({country, companies,onSelect,onAdded}: {country:string;companies:CompanyRecord[];onSelect:(id:string)=>void;onAdded:(company:CompanyRecord)=>void}) {
  const [relationships,setRelationships] = useState<RelationshipRecord[]>([]);
  const [query,setQuery] = useState("");
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [newName,setNewName]=useState("");
  const [newWebsite,setNewWebsite]=useState("");
  const [adding,setAdding]=useState(false);
  async function addCompany(event:React.FormEvent) {
    event.preventDefault();setAdding(true);setError("");
    try {
      const response=await fetch("/api/workspaces/current/companies",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:newName,website:newWebsite,country})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      if(result.duplicate){setError("候选库中已存在同名或同域名公司；若不在当前图中，请切换至该公司所属国家查看。");if(companies.some(company=>company.id===result.externalId))onSelect(result.externalId);}
      else {onAdded(result.company);setNewName("");setNewWebsite("");}
    }catch(reason){setError(reason instanceof Error?reason.message:"添加失败");}finally{setAdding(false);}
  }
  const [version,setVersion] = useState(0);
  const [form,setForm] = useState({from:"",to:"",type:"供货",status:"pending",basis:"",sourceUrl:""});
  function editRelationship(item:RelationshipRecord) {
    setForm({from:item.from,to:item.to,type:item.type,status:item.status==="evidence-supported"?"pending":item.status,basis:item.basis,sourceUrl:item.sourceUrl});
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/channel-relationships?country=${encodeURIComponent(country)}`,{signal:controller.signal,cache:"no-store"})
      .then(async response => {if(!response.ok) throw new Error("关系读取失败");return response.json();})
      .then(data=>{setRelationships(data.relationships);setLoading(false);})
      .catch(reason=>{if(!controller.signal.aborted){setError(String(reason));setLoading(false);}});
    return ()=>controller.abort();
  },[country,version]);
  async function save(event: React.FormEvent) {
    event.preventDefault();setSaving(true);setError("");
    try {
      const response=await fetch("/api/channel-relationships",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...form,country})});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      setVersion(value=>value+1);setForm({...form,basis:""});
    }catch(reason){setError(reason instanceof Error?reason.message:"保存失败");}finally{setSaving(false);}
  }
  const visible=companies.filter(company=>`${company.displayName} ${company.domain} ${primaryRole(company)}`.toLowerCase().includes(query.toLowerCase()));
  const positions=new Map(visible.map((company,index)=>[company.id,{x:160+(index%3)*310,y:55+Math.floor(index/3)*100}]));
  const height=Math.max(220,Math.ceil(visible.length/3)*100+40);
  return <div>
    <details className="panel"><summary>添加公司</summary><p>已有候选自动显示为节点；新公司保存为待核实，不自动付费搜索或评分。</p>
      <form onSubmit={addCompany}><label>公司名称<input required minLength={2} maxLength={200} value={newName} onChange={event=>setNewName(event.target.value)}/></label>
        <label>官网（可选）<input maxLength={400} value={newWebsite} onChange={event=>setNewWebsite(event.target.value)}/></label>
        <button disabled={adding}>{adding?"正在保存…":"加入当前国家"}</button>
      </form></details>
    <section className="panel">
      <div className="panel-header"><h2>渠道节点与关系</h2><span>{visible.length} / {companies.length} 家</span></div>
      <input aria-label="搜索关系图公司" placeholder="搜索公司或角色" value={query} onChange={event=>setQuery(event.target.value)}/>
      {loading&&<p role="status">正在读取关系…</p>}
      {error&&<p role="alert">{error}<button onClick={()=>setVersion(value=>value+1)}>重试读取</button></p>}
      <div style={{overflow:"auto",maxHeight:"65vh"}}>
        <svg width="940" height={height} role="img" aria-label="当前国家渠道关系图">
          <defs><marker id="relation-arrow" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#708096"/></marker></defs>
          {relationships.filter(item=>item.status!=="user-rejected").map(item=>{
            const a=positions.get(item.from),b=positions.get(item.to);if(!a||!b)return null;
            return <g key={item.id} role="button" tabIndex={0} aria-label={`${item.type}：${statusLabels[item.status]}`} onClick={()=>editRelationship(item)} onKeyDown={event=>{if(event.key==="Enter")editRelationship(item);}}>
              <line x1={a.x} y1={a.y+22} x2={b.x} y2={b.y-22} stroke="#708096" strokeWidth="2" strokeDasharray={item.status==="pending"?"6 5":undefined} markerEnd="url(#relation-arrow)"/>
              <title>{item.type} · {statusLabels[item.status]} · {item.basis}</title>
            </g>;
          })}
          {visible.map(company=>{const point=positions.get(company.id)!;return <g key={company.id} role="button" tabIndex={0} aria-label={company.displayName} onClick={()=>onSelect(company.id)} onKeyDown={event=>{if(event.key==="Enter")onSelect(company.id);}}>
            <rect x={point.x-135} y={point.y-25} width="270" height="55" rx="10" fill="#f3f6fa" stroke="#cdd7e3"/>
            <text x={point.x} y={point.y-3} textAnchor="middle" fill="#182230">{company.displayName.slice(0,28)}</text>
            <text x={point.x} y={point.y+17} textAnchor="middle" fontSize="12" fill="#596778">{primaryRole(company)}</text>
          </g>;})}
        </svg>
      </div>
      {!loading&&relationships.length===0&&<p>尚未建立关系。公司节点不代表已经存在商业合作。</p>}
    </section>
    <details className="panel"><summary>关系记录 · {relationships.length} 条</summary>
      {relationships.map(item=><article key={item.id} className="relationship-card">
        <strong>{companies.find(company=>company.id===item.from)?.displayName} → {companies.find(company=>company.id===item.to)?.displayName}</strong>
        <p>{item.type} · {statusLabels[item.status]} · {new Date(item.updatedAt).toLocaleDateString()}</p><p>{item.basis}</p>
        {item.sourceUrl&&<a href={item.sourceUrl} target="_blank" rel="noreferrer">查看来源</a>}
        <button onClick={()=>setForm({from:item.from,to:item.to,type:item.type,status:item.status==="evidence-supported"?"pending":item.status,basis:item.basis,sourceUrl:item.sourceUrl})}>编辑或确认关系</button>
      </article>)}
    </details>
    <form className="panel" onSubmit={save}><h3>添加或更新关系</h3>
      <div className="edit-grid">{(["from","to"] as const).map(key=><label key={key}>{key==="from"?"起点公司":"目标公司"}<select required value={form[key]} onChange={event=>setForm({...form,[key]:event.target.value})}><option value="">请选择公司</option>{companies.map(company=><option key={company.id} value={company.id}>{company.displayName}</option>)}</select></label>)}
        <label>关系类型<select value={form.type} onChange={event=>setForm({...form,type:event.target.value})}>{["供货","转售","项目合作","技术合作","其他"].map(type=><option key={type}>{type}</option>)}</select></label>
        <label>状态<select value={form.status} onChange={event=>setForm({...form,status:event.target.value})}>{Object.entries(statusLabels).filter(([key])=>key!=="evidence-supported").map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      </div>
      <label>判断依据<textarea required maxLength={2000} value={form.basis} onChange={event=>setForm({...form,basis:event.target.value})}/></label>
      <label>来源网址（可选）<input type="url" value={form.sourceUrl} onChange={event=>setForm({...form,sourceUrl:event.target.value})}/></label>
      <button className="primary-button" disabled={saving||form.from===form.to}>{saving?"正在保存…":"保存关系"}</button>
      <p>同方向、同类型的关系更新已有记录；修改历史和否定结果会保留。</p>
    </form>
  </div>;
}
