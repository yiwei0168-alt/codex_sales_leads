"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type {
  AssistantActionDto, AssistantConversationDto, AssistantConversationSummary, AssistantMessageDto,
} from "@/lib/assistant/types";

const suggestions = [
  "帮我制定进入德国网络设备市场的渠道开发计划",
  "搜索阿联酋 20 家分销商和系统集成商",
  "比较 WR3000 与适合中小企业的其他路由器",
  "总结邮箱知识中与产品认证有关的信息",
];

function actionForMessage(message: AssistantMessageDto, actions: AssistantActionDto[]): AssistantActionDto | undefined {
  return message.metadata.actionId ? actions.find((action) => action.id === message.metadata.actionId) : undefined;
}

export function AssistantHome({ userName, onOpenResults }: { userName: string; onOpenResults: () => void }) {
  const [conversations, setConversations] = useState<AssistantConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [conversation, setConversation] = useState<AssistantConversationDto>();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string>();
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadList(preferredId?: string) {
    const response = await fetch("/api/assistant/conversations", { cache: "no-store" });
    const body = await response.json() as { conversations?: AssistantConversationSummary[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? "对话列表读取失败");
    const list = body.conversations ?? [];
    setConversations(list);
    const nextId = preferredId ?? activeId ?? list[0]?.id;
    if (nextId) await openConversation(nextId);
  }

  async function openConversation(id: string) {
    setActiveId(id); setError("");
    const response = await fetch(`/api/assistant/conversations/${id}`, { cache: "no-store" });
    const body = await response.json() as { conversation?: AssistantConversationDto; error?: string };
    if (!response.ok || !body.conversation) throw new Error(body.error ?? "对话读取失败");
    setConversation(body.conversation);
  }

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/assistant/conversations", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { conversations?: AssistantConversationSummary[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "对话列表读取失败");
        return body.conversations ?? [];
      })
      .then(async (list) => {
        setConversations(list);
        const firstId = list[0]?.id;
        if (!firstId) return;
        const response = await fetch(`/api/assistant/conversations/${firstId}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json() as { conversation?: AssistantConversationDto; error?: string };
        if (!response.ok || !body.conversation) throw new Error(body.error ?? "对话读取失败");
        setActiveId(firstId);
        setConversation(body.conversation);
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [conversation?.messages.length]);

  async function send(content: string) {
    const message = content.trim();
    if (!message || busy) return;
    setBusy(true); setError(""); setInput("");
    try {
      const response = await fetch("/api/assistant/messages", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, content: message }),
      });
      const body = await response.json() as { conversation?: AssistantConversationDto; error?: string };
      if (!response.ok || !body.conversation) throw new Error(body.error ?? "消息处理失败");
      setConversation(body.conversation); setActiveId(body.conversation.id);
      await loadList(body.conversation.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "消息处理失败"); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent) { event.preventDefault(); await send(input); }

  async function newConversation() {
    setActiveId(undefined); setConversation(undefined); setInput(""); setError("");
  }

  async function renameConversation(item: AssistantConversationSummary) {
    const title = window.prompt("重命名对话", item.title)?.trim();
    if (!title || title === item.title) return;
    const response = await fetch(`/api/assistant/conversations/${item.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }),
    });
    if (!response.ok) { setError("重命名失败"); return; }
    await loadList(item.id);
  }

  async function removeConversation(item: AssistantConversationSummary) {
    if (!window.confirm(`删除对话“${item.title}”？相关待确认搜索计划也会删除。`)) return;
    const response = await fetch(`/api/assistant/conversations/${item.id}`, { method: "DELETE" });
    if (!response.ok) { setError("删除对话失败"); return; }
    setActiveId(undefined); setConversation(undefined);
    await loadList();
  }

  async function confirmSearch(actionId: string) {
    if (!window.confirm("确认调用 Tavily 执行该搜索计划？搜索结果、网页证据和评分将写入对应国家分区。")) return;
    setConfirmingId(actionId); setError("");
    try {
      const response = await fetch(`/api/assistant/actions/${actionId}/confirm`, { method: "POST" });
      const body = await response.json() as { conversation?: AssistantConversationDto; error?: string };
      if (!response.ok || !body.conversation) throw new Error(body.error ?? "搜索执行失败");
      setConversation(body.conversation);
      await loadList(body.conversation.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "搜索执行失败"); }
    finally { setConfirmingId(undefined); }
  }

  const messages = conversation?.messages ?? [];
  const actions = conversation?.actions ?? [];
  const greeting = useMemo(() => new Date().getHours() < 12 ? "早上好" : new Date().getHours() < 18 ? "下午好" : "晚上好", []);

  return <div className="ai-home-shell">
    <aside className="ai-session-panel">
      <div className="ai-session-head"><div><span>CONVERSATIONS</span><strong>对话记录</strong></div><button onClick={newConversation} aria-label="新建对话">＋</button></div>
      <div className="ai-session-list">
        {conversations.map((item) => <article key={item.id} className={activeId === item.id ? "active" : ""}>
          <button className="ai-session-main" onClick={() => void openConversation(item.id)}><strong>{item.title}</strong><small>{item.messageCount} 条消息 · {item.updatedAt.slice(0, 10)}</small></button>
          <div><button onClick={() => void renameConversation(item)} aria-label="重命名">✎</button><button onClick={() => void removeConversation(item)} aria-label="删除">×</button></div>
        </article>)}
        {conversations.length === 0 && <p>你的对话会安全地保存在当前账号下。</p>}
      </div>
      <div className="ai-privacy-note"><span>◉</span><p><strong>Private workspace</strong>知识检索和对话记录按用户隔离。</p></div>
    </aside>

    <section className="ai-chat-panel">
      <header><div className="ai-orb">✦</div><div><strong>Network Copilot</strong><span>知识问答 · 全球线索 · 销售策略</span></div><i>在线</i></header>
      <div className="ai-message-stream" ref={scrollRef}>
        {messages.length === 0 && <div className="ai-welcome">
          <span className="ai-welcome-icon">✦</span><p>{greeting}，{userName}</p><h1>今天想推进哪个市场？</h1>
          <small>我可以查询产品与公司知识、分析邮箱学习内容，或在你确认后搜索任何国家的销售线索。</small>
          <div className="ai-suggestion-grid">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => void send(suggestion)}><span>↗</span>{suggestion}</button>)}</div>
        </div>}
        {messages.map((message) => {
          const action = actionForMessage(message, actions);
          return <article key={message.id} className={`ai-message ${message.role}`}>
            <div className="ai-message-avatar">{message.role === "user" ? userName.slice(0, 1).toUpperCase() : "✦"}</div>
            <div className="ai-message-body"><div className="ai-message-meta"><strong>{message.role === "user" ? userName : "Network Copilot"}</strong><span>{new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span></div>
              <div className="ai-message-copy">{message.content}</div>
              {action && <div className={`ai-action-card ${action.status}`}>
                <div className="ai-action-head"><div><span>{action.payload.countryCode}</span><strong>{action.payload.countryName} 销售线索计划</strong></div><em>{action.status === "proposed" ? "等待确认" : action.status === "completed" ? "已完成" : action.status === "failed" ? "失败" : "执行中"}</em></div>
                <dl><div><dt>开发模式</dt><dd>{action.payload.objective === "new-market" ? "新市场并行开发" : "已有分销体系增长"}</dd></div><div><dt>目标数量</dt><dd>{action.payload.targetCount} 家</dd></div><div><dt>渠道角色</dt><dd>{action.payload.roles.join(" · ")}</dd></div></dl>
                {action.status === "proposed" && <button disabled={confirmingId === action.id} onClick={() => void confirmSearch(action.id)}>{confirmingId === action.id ? "正在搜索并保存…" : "确认并开始搜索"}</button>}
                {action.status === "completed" && <button onClick={onOpenResults}>查看 {action.payload.countryName} 结果</button>}
                {action.errorMessage && <p>{action.errorMessage}</p>}
              </div>}
              {(message.metadata.citations?.length ?? 0) > 0 && <div className="ai-citations"><strong>知识库证据</strong>{message.metadata.citations?.map((citation) => <a key={citation.chunkId} href={citation.sourceUrl || undefined} target="_blank" rel="noreferrer"><span>[KB:{citation.chunkId.slice(0, 8)}]</span><b>{citation.documentTitle}</b><em>{Math.round(citation.score * 100)}%</em></a>)}</div>}
              {message.metadata.grounded === false && <small className="ai-evidence-warning">回答尚未获得充分引用，请人工复核。</small>}
            </div>
          </article>;
        })}
        {busy && <article className="ai-message assistant"><div className="ai-message-avatar">✦</div><div className="ai-thinking"><i/><i/><i/></div></article>}
      </div>
      {error && <div className="ai-chat-error">{error}</div>}
      <form className="ai-composer" onSubmit={submit}><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); } }} placeholder="询问产品、公司，或描述你想搜索的国家和销售线索…" rows={1}/><div><span>知识回答附引用 · 外部搜索执行前需确认</span><button disabled={busy || !input.trim()} aria-label="发送">↑</button></div></form>
    </section>
  </div>;
}
