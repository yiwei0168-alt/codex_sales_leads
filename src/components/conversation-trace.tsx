"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { parseRunEventPage, type RunEvent } from "@/lib/assistant/main/run-events";
import { useDialogFocus } from "./use-dialog-focus";
import { EventReceipt } from "./agent-runs";

type TraceRun = { id: string; conversation_id: string; status: string };

export function ConversationTrace({ conversationId, title, onClose }: { conversationId: string; title: string; onClose: () => void }) {
  const ref = useDialogFocus(onClose);
  const [runs, setRuns] = useState<TraceRun[]>([]);
  const [selected, setSelected] = useState<string>();
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/assistant/runs?conversationId=${conversationId}`, {cache:"no-store",signal:controller.signal})
      .then(async response => { if (!response.ok) throw Error("任务列表读取失败"); return response.json() as Promise<{runs:TraceRun[]}>; })
      .then(data => { if (controller.signal.aborted) return; setRuns(data.runs); setSelected(data.runs[0]?.id); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "任务列表读取失败"); });
    return () => controller.abort();
  }, [conversationId]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    void fetch(`/api/assistant/runs/${selected}/events?after=0`, {cache:"no-store",signal:controller.signal})
      .then(async response => { if (!response.ok) throw Error("执行事件读取失败"); return parseRunEventPage(await response.text()); })
      .then(page => { if (controller.signal.aborted) return; setEvents(page); setHasMore(page.length === 100); setError(""); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "执行事件读取失败"); });
    return () => controller.abort();
  }, [selected]);
  async function loadMore() {
    if (!selected || !events.length) return;
    try {
      const response = await fetch(`/api/assistant/runs/${selected}/events?after=${events.at(-1)!.id}`, {cache:"no-store"});
      if (!response.ok) throw Error("后续事件读取失败");
      const page = parseRunEventPage(await response.text());
      setEvents(current => [...current, ...page]); setHasMore(page.length === 100); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "后续事件读取失败"); }
  }
  return createPortal(<div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={ref} role="dialog" aria-modal="true" aria-label={`${title} 技术流水`} tabIndex={-1} className="conversation-trace">
      <header><div><h2>技术流水</h2><p>{title}</p></div><button type="button" onClick={onClose} aria-label="关闭技术流水">关闭</button></header>
      {error && <p role="alert">{error}</p>}
      {!runs.length && !error && <p>这段对话尚无主 Agent 任务。</p>}
      {runs.length > 0 && <><div className="conversation-trace-runs" aria-label="任务列表">{runs.map((run,index) =>
        <button type="button" key={run.id} aria-pressed={selected === run.id} onClick={() => setSelected(run.id)}>
          第 {runs.length-index} 次 · {run.status}</button>)}</div>
        <ol className="conversation-trace-events">{events.map(event => <EventReceipt event={event} key={event.id}/>)}</ol>
        {selected && !events.length && !error && <p>暂无已保存事件。</p>}
        {hasMore && <button type="button" onClick={() => void loadMore()}>加载更多事件</button>}
      </>}
    </section>
  </div>, document.body);
}
