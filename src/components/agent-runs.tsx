"use client";
import { useEffect, useState } from "react";
import type { RunStatus } from "@/lib/assistant/main/contracts";
import { AgentApprovals } from "./agent-approvals";
import type { AgentApproval } from "@/lib/assistant/main/approvals";
type Run = { id: string; status: RunStatus; result: { reply: string } | null; approvals?: AgentApproval[]; memories?: Array<{ id: string; key: string; version: number }> };
const labels: Record<RunStatus, string> = { queued: "排队中", running: "执行中", waiting_user: "等待确认", paused: "已暂停", partial: "部分完成", completed: "已完成", failed: "失败", cancelled: "已取消" };
export function AgentRuns({ conversationId, onUpdated }: { conversationId: string; onUpdated: () => void }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState("");
  const [instruction, setInstruction] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let prior = "", pending = false;
    const load = async () => {
      if (pending) return; pending = true;
      try {
        const r = await fetch(`/api/assistant/runs?conversationId=${conversationId}`, { signal: controller.signal, cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json() as { runs: Run[] };
        setRuns(data.runs);
        const state = JSON.stringify(data.runs.map(r => [r.id, r.status]));
        if (prior && state !== prior) onUpdated();
        prior = state;
      } catch { /* reconnect on next poll */ } finally { pending = false; }
    };
    void load(); const timer = setInterval(() => void load(), 2000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [conversationId, onUpdated]);
  async function control(id: string, action: string) {
    setError("");
    try {
      const r = await fetch(`/api/assistant/runs/${id}/control`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(action === "instruct" ? { content: instruction } : {}) }) });
      if (!r.ok) throw new Error("操作失败，请刷新状态后重试");
      if (action === "instruct") setInstruction("");
      onUpdated();
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
  }
  async function undo(id: string, version: number) {
    try {
      const r = await fetch("/api/assistant/memory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, version, action: "undo" }) });
      if (!r.ok) throw new Error("偏好已变化，请刷新后核对");
      setError(""); onUpdated();
    } catch (e) { setError(e instanceof Error ? e.message : "撤销失败，请重试"); }
  }
  if (!runs.length) return null;
  return <section aria-label="Agent 任务" className="agent-runs">
    {runs.map(run => <div key={run.id} className="agent-run">
      <div className="agent-run-actions"><strong>{labels[run.status]}</strong><small>{run.id.slice(0, 8)}</small>
        {["running", "queued"].includes(run.status) && <button type="button" onClick={() => void control(run.id, "pause")}>暂停</button>}
        {["paused", "partial", "failed"].includes(run.status) && <button type="button" onClick={() => void control(run.id, "resume")}>继续</button>}
        {!["completed", "cancelled"].includes(run.status) && <button type="button" onClick={() => void control(run.id, "cancel")}>取消</button>}
      </div>
      <AgentApprovals items={run.approvals ?? []} />
      {run.memories?.map(memory => <p key={memory.id} className="text-sm">已记住偏好：{memory.key} <button type="button" onClick={() => void undo(memory.id, memory.version)}>撤销</button></p>)}
      {!["completed", "cancelled"].includes(run.status) && <div className="agent-run-actions"><input aria-label="追加任务要求" value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="追加要求，在下个安全执行边界生效" /><button type="button" disabled={!instruction.trim()} onClick={() => void control(run.id, "instruct")}>追加</button></div>}
    </div>)}
    {error && <p role="alert">{error}</p>}
    <p className="text-xs text-slate-400">任务在后台执行，关闭页面后仍可继续。暂停和取消将在安全执行边界生效。</p>
  </section>;
}
