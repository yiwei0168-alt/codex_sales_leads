"use client";
import { useEffect, useState } from "react";
import type { RunStatus } from "@/lib/assistant/main/contracts";
import { AgentApprovals } from "./agent-approvals";
type Run = { id: string; status: RunStatus; result: { reply: string } | null };
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
  if (!runs.length) return null;
  return <section aria-label="Agent 任务" className="space-y-3 rounded-xl border border-slate-700 p-4">
    {runs.map(run => <div key={run.id} className="space-y-2">
      <div className="flex flex-wrap items-center gap-3"><strong>{labels[run.status]}</strong><span className="text-xs text-slate-400">{run.id.slice(0, 8)}</span>
        {["running", "queued"].includes(run.status) && <button type="button" onClick={() => void control(run.id, "pause")}>暂停</button>}
        {["paused", "partial", "failed"].includes(run.status) && <button type="button" onClick={() => void control(run.id, "resume")}>继续</button>}
        {!["completed", "cancelled"].includes(run.status) && <button type="button" onClick={() => void control(run.id, "cancel")}>取消</button>}
      </div>
      <AgentApprovals runId={run.id} />
      {!["completed", "cancelled"].includes(run.status) && <div className="flex gap-2"><input aria-label="追加任务要求" value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="追加要求，在下个安全执行边界生效" className="min-w-0 flex-1 rounded bg-slate-900 p-2" /><button type="button" disabled={!instruction.trim()} onClick={() => void control(run.id, "instruct")}>追加</button></div>}
    </div>)}
    {error && <p role="alert">{error}</p>}
    <p className="text-xs text-slate-400">任务在后台执行，关闭页面后仍可继续。暂停和取消将在安全执行边界生效。</p>
  </section>;
}
