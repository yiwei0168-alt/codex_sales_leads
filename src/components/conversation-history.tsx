"use client";

import { useEffect, useState } from "react";
import type { AssistantConversationSummary } from "@/lib/assistant/types";

export function ConversationHistory({ activeId, refreshKey, onSelect, onNew }: {
  activeId?: string;
  refreshKey: number;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const [items, setItems] = useState<AssistantConversationSummary[]>([]);
  const [error, setError] = useState("");
  const [localVersion, setLocalVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/assistant/conversations", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("对话历史暂不可用");
        return response.json() as Promise<{ conversations: AssistantConversationSummary[] }>;
      })
      .then(data => { if (!controller.signal.aborted) { setItems(data.conversations); setError(""); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "对话历史暂不可用"); });
    return () => controller.abort();
  }, [activeId, refreshKey, localVersion]);
  async function rename(item: AssistantConversationSummary) {
    const title = window.prompt("重命名对话", item.title)?.trim();
    if (!title || title === item.title) return;
    const response = await fetch(`/api/assistant/conversations/${item.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }),
    });
    if (!response.ok) { setError("重命名失败，请刷新后重试"); return; }
    setLocalVersion(version => version + 1);
  }
  async function remove(item: AssistantConversationSummary) {
    if (!window.confirm(`删除对话“${item.title}”？请核对该对话及其待确认计划。`)) return;
    const response = await fetch(`/api/assistant/conversations/${item.id}`, { method: "DELETE" });
    if (!response.ok) { setError("删除失败，请刷新后重试"); return; }
    setLocalVersion(version => version + 1);
    if (item.id === activeId) onNew();
  }
  return <section className="conversation-history" aria-label="对话历史">
    <div className="conversation-history-head"><strong>对话历史</strong><button type="button" onClick={onNew}>新对话</button></div>
    {error && <p role="status">{error}</p>}
    <div className="conversation-history-list">
      {items.map(item => <div className={`conversation-history-item ${item.id === activeId ? "active" : ""}`} key={item.id}>
        <button type="button" className="conversation-history-select" aria-current={item.id === activeId ? "page" : undefined} onClick={() => onSelect(item.id)}>
          <span>{item.title}</span><small>{item.messageCount} 条消息 · {item.updatedAt.slice(0, 10)}</small>
        </button>
        <div className="conversation-history-actions"><button type="button" aria-label={`重命名 ${item.title}`} onClick={() => void rename(item)}>改</button><button type="button" aria-label={`删除 ${item.title}`} onClick={() => void remove(item)}>删</button></div>
      </div>)}
      {!items.length && !error && <p>还没有已保存的对话</p>}
    </div>
  </section>;
}
