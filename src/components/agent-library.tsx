"use client";
import { useRef, useState } from "react";
type Skill = { id: string; name: string; scope: string; current_version: number; enabled: boolean; published: boolean; owned: boolean };
type Memory = { id: string; memory_key: string; content: string; kind: string; scope: string; current_version: number; mandatory: boolean; owned: boolean };
type Schedule = { id: string; title: string; content: string; timezone: string; enabled: boolean; version: number; next_run_at: string; active_run_id: string | null };
type Pane="skills"|"memory"|"schedules";
export function AgentLibrary() {
  const request=useRef(0);
  const [loads,setLoads]=useState<Record<Pane,string>>({skills:"idle",memory:"idle",schedules:"idle"});
  const [pane,setPane]=useState<Pane>("skills");
  const [skills, setSkills] = useState<Skill[]>([]), [memories, setMemories] = useState<Memory[]>([]), [schedules, setSchedules] = useState<Schedule[]>([]);
  const [name, setName] = useState(""), [instructions, setInstructions] = useState("");
  const [sourceName, setSourceName] = useState(""), [sourceKind, setSourceKind] = useState<"url" | "github">("url"), [sourceUrl, setSourceUrl] = useState(""), [sourceRef, setSourceRef] = useState("main"), [sourceDirectory, setSourceDirectory] = useState("");
  const [title, setTitle] = useState(""), [content, setContent] = useState(""), [minutes, setMinutes] = useState(1440);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  async function load() {
    const sequence=++request.current;
    setLoads({skills:"loading",memory:"loading",schedules:"loading"});
    await Promise.all((["skills","memory","schedules"] as const).map(async path=>{
      try {
        const response=await fetch(`/api/assistant/${path}`,{cache:"no-store"});
        if(!response.ok)throw new Error("读取失败，请刷新重试。");
        const body=await response.json();
        const rows=body[path==="memory"?"memories":path];
        if(!Array.isArray(rows))throw new Error("返回内容不完整，请刷新重试。");
        if(sequence!==request.current)return;
        if(path==="skills")setSkills(rows);else if(path==="memory")setMemories(rows);else setSchedules(rows);
        setLoads(previous=>({...previous,[path]:"ready"}));
      }catch(e){if(sequence===request.current)setLoads(previous=>({...previous,[path]:e instanceof Error?e.message:"读取失败，请刷新重试。"}));}
    }));
  }
  async function save(path: string, method: string, body: unknown, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/assistant/${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "内容或版本已变化，请刷新后重试");
      const validation = result?.validation ? `说明：${result.validation.instructions}；脚本：${result.validation.scripts}；依赖：${result.validation.dependencies}。` : "";
      setNotice(`${success}${validation}`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); }
    finally { setBusy(false); }
  }
  return <details className="agent-library" onToggle={e => { if (e.currentTarget.open) void load(); }}>
    <summary>Skill、记忆与定时任务</summary>
    <div className="agent-library-body">
      <button type="button" disabled={busy||Object.values(loads).includes("loading")} onClick={() => void load()}>刷新</button>
      {loads[pane]==="loading"&&<p role="status">正在读取{pane==="skills"?" Skill":pane==="memory"?"记忆":"定时任务"}…</p>}
      {!["idle","loading","ready"].includes(loads[pane])&&<p role="alert">{loads[pane]}{(pane==="skills"?skills:pane==="memory"?memories:schedules).length>0?" 下方保留上次读取内容，刷新成功后才能操作。":""}</p>}
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <nav className="agent-library-tabs" aria-label="Agent management"><button aria-pressed={pane==="skills"} onClick={()=>setPane("skills")}>Skill</button><button aria-pressed={pane==="memory"} onClick={()=>setPane("memory")}>记忆</button><button aria-pressed={pane==="schedules"} onClick={()=>setPane("schedules")}>定时任务</button></nav><section hidden={pane!=="skills"}><h3>Skill</h3>
      <p>个人方法仅本账户可用。管理员导入的方法须在对话中确认发布后全局可用。</p>
      {loads.skills==="ready"&&skills.length===0&&<p>暂无 Skill，可在下方保存草案。</p>}
      {skills.map(s => <article key={s.id}><strong>{s.name}</strong><small>{s.scope === "global" ? "全局" : "个人"} · v{s.current_version} · {s.enabled ? s.scope === "global" && !s.published ? "待发布" : "启用" : "停用"}</small>
        {s.owned && <button type="button" disabled={busy||loads[pane]!=="ready"} onClick={() => void save("skills", "PATCH", { id: s.id, version: s.current_version, operation: s.enabled ? "disable" : "enable" }, "Skill 状态已更新；全局方法重新启用后仍需确认发布。")}>{s.enabled ? "停用" : "启用"}</button>}
      </article>)}
      <form onSubmit={e => { e.preventDefault(); void save("skills", "POST", { name, source: "Account instruction editor", files: { "SKILL.md": instructions }, dependencies: [] }, "方法已保存为未启用草案；请在记忆中心检查版本和验证状态。"); }}>
        <label>方法名称<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>使用说明<textarea required maxLength={200000} rows={4} value={instructions} onChange={e => setInstructions(e.target.value)} /></label>
        <button disabled={busy||loads[pane]!=="ready"}>保存方法</button>
      </form>
      <label>导入 Skill JSON 包<input type="file" accept="application/json,.json" disabled={busy||loads[pane]!=="ready"} onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        if (file.size > 1_100_000) { setError("Skill 包不能超过 1 MB"); return; }
        try { await save("skills", "POST", JSON.parse(await file.text()), "Skill 包已保存为未启用草案；请在记忆中心检查版本和验证状态。"); }
        catch { setError("文件不是有效 JSON Skill 包"); }
        e.target.value = "";
      }} /></label>
      <form onSubmit={e => { e.preventDefault(); void save("skills", "POST", sourceKind === "url"
        ? { kind: "url", name: sourceName, url: sourceUrl }
        : { kind: "github", name: sourceName, repository: sourceUrl, ref: sourceRef, directory: sourceDirectory }, "公开 Skill 来源已保存为未启用草案；请检查验证状态。 "); }}>
        <label>导入方式<select value={sourceKind} onChange={e => { setSourceKind(e.target.value as "url" | "github"); setSourceUrl(""); }}><option value="url">SKILL.md 网址</option><option value="github">GitHub 仓库</option></select></label>
        <label>来源 Skill 名称<input required maxLength={120} value={sourceName} onChange={e => setSourceName(e.target.value)} /></label>
        <label>{sourceKind === "url" ? "公开 SKILL.md 的 HTTPS 网址" : "公开 GitHub 仓库网址"}<input required type="url" maxLength={1000} value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} /></label>
        {sourceKind === "github" && <><label>分支、标签或提交<input required maxLength={120} value={sourceRef} onChange={e => setSourceRef(e.target.value)} /></label>
          <label>仓库内 Skill 目录（留空表示根目录）<input maxLength={180} value={sourceDirectory} onChange={e => setSourceDirectory(e.target.value)} /></label></>}
        <button disabled={busy||loads[pane]!=="ready"}>从公开来源导入</button>
      </form>
      </section><section hidden={pane!=="memory"}><h3>当前记忆与政策</h3>
      {loads.memory==="ready" && memories.length === 0 && <p>尚无统一记忆；历史开发信记忆仍保留在原知识管理页面。</p>}
      {memories.map(m => <article key={m.id}><strong>{m.memory_key}</strong><small>{m.scope === "global" ? "全局" : "个人"} · {m.mandatory ? "强制政策" : m.kind} · v{m.current_version}</small><p>{m.content}</p>
        {m.owned && m.scope === "account" && <button type="button" disabled={busy||loads[pane]!=="ready"} onClick={() => void save("memory", "PATCH", { id: m.id, version: m.current_version, action: "undo" }, "已撤销此版本，来源记录保留。")}>撤销此版本</button>}
      </article>)}
      </section><section hidden={pane!=="schedules"}><h3>定时任务</h3><p>任务使用账户时区，默认 Asia/Shanghai。已有任务未结束时不重叠执行；邮件每次仍需确认最终内容。</p>
      {loads.schedules==="ready"&&schedules.length===0&&<p>暂无定时任务。</p>}
      {schedules.map(s => <article key={s.id}><strong>{s.title}</strong><small>{s.enabled ? `下次：${new Date(s.next_run_at).toLocaleString("zh-CN", { timeZone: s.timezone })} (${s.timezone})` : "已停用"}</small><p>{s.content}</p>
        <button type="button" disabled={busy||loads[pane]!=="ready"} onClick={() => void save("schedules", "PATCH", { id: s.id, version: s.version, enabled: !s.enabled }, "定时任务已更新；已开始的任务可在对话中控制。")}>{s.enabled ? "停用" : "启用"}</button>
      </article>)}
      <form onSubmit={e => { e.preventDefault(); void save("schedules", "POST", { title, content, plan: { kind: "interval", minutes } }, "定时任务已创建。可在对话记录中查看每次执行。"); }}>
        <label>任务名称<input required maxLength={180} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label>执行要求<textarea required minLength={2} maxLength={100000} rows={3} value={content} onChange={e => setContent(e.target.value)} /></label>
        <label>间隔（分钟）<input required type="number" min={1} max={525600} value={minutes} onChange={e => setMinutes(Number(e.target.value))} /></label>
        <button disabled={busy||loads[pane]!=="ready"}>创建周期任务</button>
      </form>
    </section></div>
  </details>;
}
