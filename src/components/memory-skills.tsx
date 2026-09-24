"use client";
import {useEffect,useState} from "react";

type Skill={id:string;name:string;scope:string;current_version:number;enabled:boolean;published:boolean;owned:boolean;
  source:string;validation:{scripts?:string;dependencies?:string};created_at:string};
type Version={version:number;source:string;created_at:string;validation:{scripts?:string;dependencies?:string}};
const instructionOnly=(version:Version)=>version.validation.scripts==="none"&&version.validation.dependencies==="none";

export function MemorySkills(){
  const [offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
  const [items,setItems]=useState<Skill[]>([]),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [versions,setVersions]=useState<Record<string,Version[]>>({});
  const [selectedVersion,setSelectedVersion]=useState<Record<string,number>>({});
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`/api/assistant/skills?offset=${offset}`,{cache:"no-store",signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error("Skill 列表读取失败");return response.json();})
      .then(data=>{if(controller.signal.aborted)return;setItems(data.items??[]);setHasMore(Boolean(data.hasMore));setLoading(false);setError("");})
      .catch(error=>{if(!controller.signal.aborted){setError(error instanceof Error?error.message:"Skill 列表读取失败");setLoading(false);}});
    return()=>controller.abort();
  },[offset,revision]);
  async function loadVersions(id:string){
    setBusy(true);setError("");
    try{const response=await fetch(`/api/assistant/skills?id=${encodeURIComponent(id)}`,{cache:"no-store"});
      if(!response.ok)throw new Error("历史版本读取失败");
      const data=await response.json() as {versions:Version[]};
      setVersions(current=>({...current,[id]:data.versions}));
      const previous=data.versions.find(version=>version.version!==items.find(item=>item.id===id)?.current_version&&instructionOnly(version));
      if(previous)setSelectedVersion(current=>({...current,[id]:previous.version}));
    }catch(error){setError(error instanceof Error?error.message:"历史版本读取失败");}finally{setBusy(false);}
  }
  async function change(skill:Skill,operation:"enable"|"disable"|"rollback"){
    setBusy(true);setError("");setNotice("");
    try{const version=operation==="rollback"?selectedVersion[skill.id]:skill.current_version;
      if(!version)throw new Error("请选择要恢复的版本");
      const response=await fetch("/api/assistant/skills",{method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify({id:skill.id,version,operation})});
      if(!response.ok)throw new Error("Skill 已变化，请刷新后重试");
      setNotice(operation==="rollback"?`已恢复 ${skill.name} 的 v${version}`:`${skill.name} 已${operation==="enable"?"启用":"停用"}`);
      setVersions(current=>({...current,[skill.id]:[]}));setRevision(value=>value+1);
    }catch(error){setError(error instanceof Error?error.message:"Skill 更新失败");}finally{setBusy(false);}
  }
  return <section className="memory-skills" aria-label="Skill">
    <h3>Skill</h3><p>账户方法保留来源和版本。脚本与跨账户方法仍须单独审核。</p>
    {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
    {loading&&<p>正在读取…</p>}
    {!loading&&!error&&!items.length&&<p>还没有 Skill。通过对话或方法管理添加后会显示在这里。</p>}
    <div className="memory-skill-list">{items.map(skill=><article key={skill.id} className="memory-skill-row">
      <div><strong>{skill.name}</strong><small>v{skill.current_version} · {skill.scope==="global"?"全局":"本账户"} · {skill.enabled?(skill.scope==="global"&&!skill.published?"待发布":"已启用"):"已停用"}</small>
        <small>来源：{skill.source}</small></div>
      {skill.owned&&<div className="memory-skill-actions">
        <button type="button" disabled={busy||(!skill.enabled&&(skill.validation.scripts!=="none"||skill.validation.dependencies!=="none"))}
          title={!skill.enabled&&(skill.validation.scripts!=="none"||skill.validation.dependencies!=="none")?"脚本或依赖需先审核":undefined}
          onClick={()=>void change(skill,skill.enabled?"disable":"enable")}>{skill.enabled?"停用":skill.validation.scripts!=="none"||skill.validation.dependencies!=="none"?"待审核":"启用"}</button>
        <button type="button" disabled={busy} onClick={()=>void loadVersions(skill.id)}>历史版本</button>
      </div>}
      {skill.owned&&versions[skill.id]?.some(version=>version.version!==skill.current_version&&instructionOnly(version))&&<div className="memory-skill-history">
        <label>恢复到 <select value={selectedVersion[skill.id]??""} onChange={event=>setSelectedVersion(current=>({...current,[skill.id]:Number(event.target.value)}))}>
          {versions[skill.id].filter(version=>version.version!==skill.current_version&&instructionOnly(version)).map(version=><option key={version.version} value={version.version}>v{version.version}</option>)}
        </select></label><button type="button" disabled={busy} onClick={()=>void change(skill,"rollback")}>恢复版本</button>
      </div>}
    </article>)}</div>
    <div className="library-pagination"><button type="button" disabled={loading||offset===0} onClick={()=>{setOffset(Math.max(0,offset-12));setLoading(true);}}>上一页</button>
      <span>第 {offset/12+1} 页</span><button type="button" disabled={loading||!hasMore} onClick={()=>{setOffset(offset+12);setLoading(true);}}>下一页</button></div>
  </section>;
}
