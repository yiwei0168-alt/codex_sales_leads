"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AssistantConversationSummary } from "@/lib/assistant/types";
import { ConversationTrace } from "./conversation-trace";

export function ConversationHistory({ activeId, refreshKey, onSelect, onNew }: {
  activeId?: string;
  refreshKey: number;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const [items, setItems] = useState<AssistantConversationSummary[]>([]);
  const [error, setError] = useState("");
  const [localVersion, setLocalVersion] = useState(0);
  const [openMenu, setOpenMenu] = useState<string>();
  const [menuPosition, setMenuPosition] = useState({top:0,left:0});
  const [trace, setTrace] = useState<AssistantConversationSummary>();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!openMenu) return;
    function outside(event: PointerEvent) { if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpenMenu(undefined); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { setOpenMenu(undefined); triggerRef.current?.focus(); } }
    menuRef.current?.querySelector("button")?.focus();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [openMenu]);
  function toggleMenu(id: string, trigger: HTMLButtonElement) {
    if (openMenu === id) { setOpenMenu(undefined); return; }
    const rect = trigger.getBoundingClientRect(), width = 184, height = 144;
    setMenuPosition({top:rect.bottom + height + 6 > window.innerHeight ? Math.max(8,rect.top - height - 4) : rect.bottom + 4,
      left:Math.max(8,Math.min(rect.right - width,window.innerWidth - width - 8))});
    setOpenMenu(id);
  }
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
    setOpenMenu(undefined);
    const title = window.prompt("重命名对话", item.title)?.trim();
    if (!title || title === item.title) return;
    const response = await fetch(`/api/assistant/conversations/${item.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }),
    });
    if (!response.ok) { setError("重命名失败，请刷新后重试"); return; }
    setLocalVersion(version => version + 1);
  }
  async function remove(item: AssistantConversationSummary) {
    setOpenMenu(undefined);
    if (!window.confirm(`从历史中删除对话“${item.title}”？已完成任务和必要审计记录会保留；进行中的任务不能删除。`)) return;
    const response = await fetch(`/api/assistant/conversations/${item.id}`, { method: "DELETE" });
    if (!response.ok) { const body = await response.json().catch(() => null) as {error?:string}|null; setError(body?.error ?? "删除失败，请刷新后重试"); return; }
    setLocalVersion(version => version + 1);
    if (item.id === activeId) { sessionStorage.removeItem("lastConversationId"); onNew(); }
  }
  return <section className="conversation-history" aria-label="对话历史">
    <div className="conversation-history-head"><strong>对话历史</strong></div>
    {error && <p role="status">{error}</p>}
    <div className="conversation-history-list">
      {items.map(item => <div className={`conversation-history-item ${item.id === activeId ? "active" : ""}`} key={item.id}>
        <button type="button" className="conversation-history-select" aria-current={item.id === activeId ? "page" : undefined} onClick={() => { setOpenMenu(undefined); onSelect(item.id); }}>
          <span>{item.title}</span><small>{item.messageCount} 条消息 · {item.updatedAt.slice(0, 10)}</small>
        </button>
        <div className="conversation-history-actions">
          <button ref={openMenu === item.id ? triggerRef : undefined} type="button" className="conversation-history-more" aria-label={`${item.title} 更多操作`} aria-haspopup="menu" aria-expanded={openMenu === item.id} onClick={event => toggleMenu(item.id,event.currentTarget)}>⋯</button>
        </div>
      </div>)}
      {!items.length && !error && <p>还没有已保存的对话</p>}
    </div>
    {openMenu && items.find(item => item.id === openMenu) && createPortal(<div ref={menuRef} role="menu" aria-label={`${items.find(item => item.id === openMenu)!.title} 操作`} className="conversation-history-menu" style={menuPosition}>
      <button type="button" role="menuitem" onClick={() => void rename(items.find(item => item.id === openMenu)!)}>重命名</button>
      <button type="button" role="menuitem" onClick={() => { setTrace(items.find(item => item.id === openMenu)!); setOpenMenu(undefined); }}>查看技术流水</button>
      <button type="button" role="menuitem" className="danger" onClick={() => void remove(items.find(item => item.id === openMenu)!)}>删除对话</button>
    </div>, document.body)}
    {trace && <ConversationTrace key={trace.id} conversationId={trace.id} title={trace.title} onClose={() => setTrace(undefined)}/>}
  </section>;
}
