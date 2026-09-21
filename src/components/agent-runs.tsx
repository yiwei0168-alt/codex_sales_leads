"use client";

import { useEffect, useState } from "react";
import type { RunStatus } from "@/lib/assistant/main/contracts";
import { parseRunEventPage, type RunEvent } from "@/lib/assistant/main/run-events";
import { AgentApprovals } from "./agent-approvals";
import type { AgentApproval } from "@/lib/assistant/main/approvals";

type Run = { id: string; status: RunStatus; result: { reply: string } | null; approvals?: AgentApproval[];
  memories?: Array<{ id: string; key: string; version: number }>;
  batch?: { status: string; providerStatus: string | null; submittedAt: string; pollCount: number } | null };
const labels: Record<RunStatus, string> = { queued: "排队中", running: "执行中", waiting_user: "等待确认", paused: "已暂停", partial: "部分完成", completed: "已完成", failed: "失败", cancelled: "已取消" };
const outcomeLabels: Record<string, string> = { success: "完成", partial: "部分结果", missing_input: "缺少信息", waiting_approval: "等待确认", unavailable: "暂不可用", unknown: "结果待核对" };
const safeHref = (url: unknown) => typeof url === "string" && (/^https?:\/\//i.test(url) || url.startsWith("/api/")) ? url : undefined;
function elapsed(start: string, now: number) { const seconds = Math.max(0, Math.floor((now - new Date(start).getTime()) / 1000)); return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`; }
function eventText(event: RunEvent) {
  const p = event.payload;
  if (event.kind === "tool_started") return `${String(p.tool ?? "工具")} · 已开始`;
  if (event.kind === "tool_result") return `${String(p.tool ?? "工具")} · ${outcomeLabels[String(p.status)] ?? String(p.status ?? "已返回")}`;
  if (event.kind === "model_batch_submitted") return `${String(p.model ?? "GLM Batch")} · 已提交批次，等待供应商结果`;
  if (event.kind === "model_batch_result") return `模型批次 · ${String(p.status ?? "结果已保存")}`;
  if (event.kind === "model_turn") return `模型完成一次规划 · ${String(p.toolCount ?? 0)} 项工具选择`;
  if (event.kind === "approval_requested") return `${String(p.tool ?? "操作")} · 等待最终内容确认`;
  if (event.kind === "approval_decision") return `确认决定 · ${String(p.decision ?? "已记录")}`;
  if (event.kind === "status") return `任务状态 · ${labels[p.status as RunStatus] ?? String(p.status ?? "已更新")}`;
  return event.kind.replaceAll("_", " ");
}
function EventReceipt({ event }: { event: RunEvent }) {
  const p = event.payload;
  const sources = Array.isArray(p.sources) ? p.sources as Array<{ title?: string; url?: string }> : [];
  const artifacts = Array.isArray(p.artifacts) ? p.artifacts as Array<{ id?: string; title?: string; url?: string }> : [];
  const missing = Array.isArray(p.missing) ? p.missing as string[] : [];
  return <li className="agent-run-event"><span>{eventText(event)}</span>
    {event.kind === "tool_result" && <small>调用回执 {String(p.callId ?? "未知").slice(0, 8)} · 事件 {event.id}</small>}
    {typeof p.receipt === "string" && <small>执行回执 {p.receipt}</small>}
    {missing.length > 0 && <p>缺项：{missing.join("；")}</p>}
    {(sources.length > 0 || artifacts.length > 0) && <div className="agent-run-links">
      {sources.map((source, index) => safeHref(source.url) ? <a key={`s${index}`} href={safeHref(source.url)} target="_blank" rel="noreferrer">来源 · {source.title || source.url}</a> : <span key={`s${index}`}>来源 · {source.title || "地址不可用"}</span>)}
      {artifacts.map((artifact, index) => safeHref(artifact.url) ? <a key={`a${index}`} href={safeHref(artifact.url)}>产物 · {artifact.title || artifact.id}</a> : <span key={`a${index}`}>产物 · {artifact.title || artifact.id}</span>)}
    </div>}
  </li>;
}
export function AgentRuns({ conversationId, onUpdated }: { conversationId: string; onUpdated: () => void }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [eventsByRun, setEventsByRun] = useState<Record<string, RunEvent[]>>({});
  const [error, setError] = useState(""), [instruction, setInstruction] = useState("");
  const [now, setNow] = useState(0);
  useEffect(() => {
    const controller = new AbortController(), cursors = new Map<string, string>();
    let prior = "", pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(`/api/assistant/runs?conversationId=${conversationId}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("任务状态暂不可用，正在重试");
        const data = await response.json() as { runs: Run[] };
        if (controller.signal.aborted) return;
        setRuns(data.runs);
        await Promise.all(data.runs.map(async run => {
          for (let page = 0; page < 5; page++) {
            const after = cursors.get(run.id) ?? "0";
            const response = await fetch(`/api/assistant/runs/${run.id}/events?after=${after}`, { signal: controller.signal, cache: "no-store" });
            if (!response.ok) throw new Error("任务事件暂不可用，正在重试");
            const events = parseRunEventPage(await response.text());
            if (!events.length || controller.signal.aborted) break;
            cursors.set(run.id, events[events.length - 1].id);
            setEventsByRun(current => ({ ...current, [run.id]: [...(current[run.id] ?? []), ...events] }));
            if (events.length < 100) break;
          }
        }));
        const state = JSON.stringify(data.runs.map(run => [run.id, run.status, run.batch?.status, cursors.get(run.id)]));
        if (prior && state !== prior) onUpdated();
        prior = state; setError("");
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "任务状态暂不可用，正在重试"); }
      finally { pending = false; }
    };
    void load();
    const timer = window.setInterval(() => void load(), 2500), clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { controller.abort(); window.clearInterval(timer); window.clearInterval(clock); };
  }, [conversationId, onUpdated]);
  async function control(id: string, action: string) {
    setError("");
    try {
      const response = await fetch(`/api/assistant/runs/${id}/control`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(action === "instruct" ? { content: instruction } : {}) }) });
      if (!response.ok) throw new Error("操作失败，请刷新状态后重试");
      if (action === "instruct") setInstruction(""); onUpdated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败"); }
  }
  async function undo(id: string, version: number) {
    try { const response = await fetch("/api/assistant/memory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, version, action: "undo" }) });
      if (!response.ok) throw new Error("偏好已变化，请刷新后核对"); setError(""); onUpdated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "撤销失败，请重试"); }
  }
  if (!runs.length) return null;
  return <section aria-label="Agent 任务" className="agent-runs">
    {runs.map(run => <article key={run.id} className="agent-run">
      <div className="agent-run-actions"><strong>{labels[run.status]}</strong><small>任务 {run.id.slice(0, 8)}</small>
        {["running", "queued"].includes(run.status) && <button type="button" onClick={() => void control(run.id, "pause")}>暂停</button>}
        {["paused", "partial", "failed"].includes(run.status) && <button type="button" onClick={() => void control(run.id, "resume")}>继续</button>}
        {!["completed", "cancelled"].includes(run.status) && <button type="button" onClick={() => void control(run.id, "cancel")}>取消</button>}
      </div>
      {run.batch && <p className="agent-batch-state" role="status">{run.batch.status === "pending" ? `GLM Batch ${run.batch.providerStatus === "in_progress" ? "执行中" : "排队或等待结果"}` : run.batch.status === "completed" ? "GLM Batch 结果已保存" : `GLM Batch ${run.batch.status}，请核对`}{` · 已经过 ${elapsed(run.batch.submittedAt, now)} · 查询 ${run.batch.pollCount} 次`}</p>}
      <AgentApprovals items={run.approvals ?? []} />
      {run.memories?.map(memory => <p key={memory.id} className="text-sm">已记住偏好：{memory.key} <button type="button" onClick={() => void undo(memory.id, memory.version)}>撤销</button></p>)}
      {(eventsByRun[run.id]?.length ?? 0) > 0 && <details className="agent-run-timeline" open={run.status !== "completed"}><summary>执行记录 · {eventsByRun[run.id].length} 条已保存事件</summary><ol>{eventsByRun[run.id].slice(-16).map(event => <EventReceipt key={event.id} event={event}/>)}</ol></details>}
      {run.result?.reply && <p className="agent-run-result">{run.result.reply}</p>}
      {!["completed", "cancelled"].includes(run.status) && <div className="agent-run-actions"><input aria-label="追加任务要求" value={instruction} onChange={event => setInstruction(event.target.value)} placeholder="追加要求，在下个安全边界生效" /><button type="button" disabled={!instruction.trim()} onClick={() => void control(run.id, "instruct")}>追加</button></div>}
    </article>)}
    {error && <p role="status">{error}</p>}
  </section>;
}
