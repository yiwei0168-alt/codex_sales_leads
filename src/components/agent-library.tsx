"use client";
import { useState } from "react";
type Skill = { id: string; name: string; scope: string; current_version: number; enabled: boolean; published: boolean; owned: boolean };
type Memory = { id: string; memory_key: string; content: string; kind: string; scope: string; current_version: number; mandatory: boolean; owned: boolean };
type Schedule = { id: string; title: string; content: string; timezone: string; enabled: boolean; version: number; next_run_at: string; active_run_id: string | null };
export function AgentLibrary() {
  const [skills, setSkills] = useState<Skill[]>([]), [memories, setMemories] = useState<Memory[]>([]), [schedules, setSchedules] = useState<Schedule[]>([]);
  const [name, setName] = useState(""), [instructions, setInstructions] = useState("");
  const [title, setTitle] = useState(""), [content, setContent] = useState(""), [minutes, setMinutes] = useState(1440);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  async function load() {
    try {
      const responses = await Promise.all(["skills", "memory", "schedules"].map(path => fetch(`/api/assistant/${path}`, { cache: "no-store" })));
      if (responses.some(r => !r.ok)) throw new Error("管理数据加载失败，请重试");
      const [s, m, t] = await Promise.all(responses.map(r => r.json()));
      setSkills(s.skills); setMemories(m.memories); setSchedules(t.schedules);
    } catch (e) { setError(e instanceof Error ? e.message : "加载失败"); }
  }
  async function save(path: string, method: string, body: unknown, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/assistant/${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "内容或版本已变化，请刷新后重试");
      setNotice(success); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); }
    finally { setBusy(false); }
  }
  return <details className="agent-library" onToggle={e => { if (e.currentTarget.open) void load(); }}>
    <summary>Skill、记忆与定时任务</summary>
    <div className="agent-library-body">
      <button type="button" disabled={busy} onClick={() => void load()}>刷新</button>
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <h3>Skill</h3>
      <p>个人方法仅本账户可用。管理员导入的方法须在对话中确认发布后全局可用。</p>
      {skills.map(s => <article key={s.id}><strong>{s.name}</strong><small>{s.scope === "global" ? "全局" : "个人"} · v{s.current_version} · {s.enabled ? s.scope === "global" && !s.published ? "待发布" : "启用" : "停用"}</small>
        {s.owned && <button type="button" disabled={busy} onClick={() => void save("skills", "PATCH", { id: s.id, version: s.current_version, operation: s.enabled ? "disable" : "enable" }, "Skill 状态已更新；全局方法重新启用后仍需确认发布。")}>{s.enabled ? "停用" : "启用"}</button>}
      </article>)}
      <form onSubmit={e => { e.preventDefault(); void save("skills", "POST", { name, source: "Account instruction editor", files: { "SKILL.md": instructions }, dependencies: [] }, "方法已保存；可在对话中按名称使用。脚本和依赖的可用性另行检查。"); }}>
        <label>方法名称<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>使用说明<textarea required maxLength={200000} rows={4} value={instructions} onChange={e => setInstructions(e.target.value)} /></label>
        <button disabled={busy}>保存方法</button>
      </form>
      <label>导入 Skill JSON 包<input type="file" accept="application/json,.json" disabled={busy} onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        if (file.size > 1_100_000) { setError("Skill 包不能超过 1 MB"); return; }
        try { await save("skills", "POST", JSON.parse(await file.text()), "Skill 包已导入，脚本依赖状态可在对话中检查。"); }
        catch { setError("文件不是有效 JSON Skill 包"); }
        e.target.value = "";
      }} /></label>
      <h3>当前记忆与政策</h3>
      {memories.length === 0 && <p>尚无统一记忆；历史开发信记忆仍保留在原知识管理页面。</p>}
      {memories.map(m => <article key={m.id}><strong>{m.memory_key}</strong><small>{m.scope === "global" ? "全局" : "个人"} · {m.mandatory ? "强制政策" : m.kind} · v{m.current_version}</small><p>{m.content}</p>
        {m.owned && m.scope === "account" && <button type="button" disabled={busy} onClick={() => void save("memory", "PATCH", { id: m.id, version: m.current_version, action: "undo" }, "已撤销此版本，来源记录保留。")}>撤销此版本</button>}
      </article>)}
      <h3>定时任务</h3><p>任务使用账户时区，默认 Asia/Shanghai。已有任务未结束时不重叠执行；邮件每次仍需确认最终内容。</p>
      {schedules.map(s => <article key={s.id}><strong>{s.title}</strong><small>{s.enabled ? `下次：${new Date(s.next_run_at).toLocaleString("zh-CN", { timeZone: s.timezone })} (${s.timezone})` : "已停用"}</small><p>{s.content}</p>
        <button type="button" disabled={busy} onClick={() => void save("schedules", "PATCH", { id: s.id, version: s.version, enabled: !s.enabled }, "定时任务已更新；已开始的任务可在对话中控制。")}>{s.enabled ? "停用" : "启用"}</button>
      </article>)}
      <form onSubmit={e => { e.preventDefault(); void save("schedules", "POST", { title, content, plan: { kind: "interval", minutes } }, "定时任务已创建。可在对话记录中查看每次执行。"); }}>
        <label>任务名称<input required maxLength={180} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label>执行要求<textarea required minLength={2} maxLength={100000} rows={3} value={content} onChange={e => setContent(e.target.value)} /></label>
        <label>间隔（分钟）<input required type="number" min={1} max={525600} value={minutes} onChange={e => setMinutes(Number(e.target.value))} /></label>
        <button disabled={busy}>创建周期任务</button>
      </form>
    </div>
  </details>;
}
