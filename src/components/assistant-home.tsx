"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AgentRuns } from "./agent-runs";
import {AgentAttachments} from "./agent-attachments";
import { TaskDetailView } from "./task-detail-view";
import {BudgetProposalCard} from "./budget-proposal";
import type {
  AssistantActionDto, AssistantConversationDto, AssistantMessageDto,
} from "@/lib/assistant/types";
import {searchTaskStatusLabel,taskCounts} from "@/lib/assistant/task-summary";

const pendingInputs = new Map<string, string>();
export function clearPendingConversationInputs() { pendingInputs.clear(); }

const suggestions = [
  "帮我制定进入德国网络设备市场的渠道开发计划",
  "搜索阿联酋 20 家分销商和系统集成商",
  "比较 WR3000 与适合中小企业的其他路由器",
  "总结邮箱知识中与产品认证有关的信息",
];

function actionForMessage(message: AssistantMessageDto, actions: AssistantActionDto[]): AssistantActionDto | undefined {
  return message.metadata.actionId ? actions.find((action) => action.id === message.metadata.actionId) : undefined;
}

export function AssistantHome({ userName, initialConversationId, onConversationChange, onOpenResults,onOpenCompany }: { userName: string; initialConversationId?: string; onConversationChange: (id?: string) => void; onOpenResults: (countryCode: string) => void;onOpenCompany:(id:string,kind:"library"|"strategy"|"follow-up")=>void }) {
  const [taskId,setTaskId]=useState<string>();
  const [activeId, setActiveId] = useState<string | undefined>(initialConversationId);
  const [conversation, setConversation] = useState<AssistantConversationDto>();
  const draftKey = initialConversationId ?? "new";
  const [input, updateInput] = useState(() => pendingInputs.get(draftKey) ?? "");
  function setInput(value: string) { pendingInputs.set(draftKey, value); updateInput(value); }
  const [attachments,setAttachments]=useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string>();
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const refreshAgentConversation = useCallback(() => {
    if (!activeId) return;
    void fetch(`/api/assistant/conversations/${activeId}`, { cache: "no-store" })
      .then(r => r.json()).then((data: { conversation?: AssistantConversationDto }) => {
        if (data.conversation) setConversation(data.conversation);
      }).catch(() => undefined);
  }, [activeId]);

  useEffect(() => {
    if (!initialConversationId) return;
    const controller = new AbortController();
    void fetch(`/api/assistant/conversations/${initialConversationId}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { conversation?: AssistantConversationDto; error?: string };
        if (!response.ok || !body.conversation) throw new Error(body.error ?? "对话读取失败");
        if (!controller.signal.aborted) setConversation(body.conversation);
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      });
    return () => controller.abort();
  }, [initialConversationId]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [conversation?.messages.length]);
  const workflowActive = conversation?.actions.some((action) => action.status === "confirmed" || action.status === "running") ?? false;
  useEffect(() => {
    if (!activeId || !workflowActive) return;
    const controller = new AbortController();
    let pending=false;
    const timer = window.setInterval(() => {
      if(pending||document.hidden)return;pending=true;
      void fetch(`/api/assistant/conversations/${activeId}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const body = await response.json() as { conversation?: AssistantConversationDto; error?: string };
          if (!response.ok || !body.conversation) throw new Error(body.error ?? "工作流状态读取失败");
          if(!controller.signal.aborted)setConversation(body.conversation);
        })
        .catch((reason: Error) => { if (reason.name !== "AbortError") setError(reason.message); }).finally(()=>{pending=false;});
    }, 4_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [activeId, workflowActive]);

  async function send(content: string) {
    const message = content.trim();
    if (!message || busy) return;
    setBusy(true); setError(""); setInput("");
    try {
      const response = await fetch("/api/assistant/messages", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, content: message, requestKey: crypto.randomUUID(),attachments:attachments.map(assetId=>({assetId})) }),
      });
      const body = await response.json() as { conversation?: AssistantConversationDto; error?: string };
      if (!response.ok || !body.conversation) throw new Error(body.error ?? "消息处理失败");
      setConversation(body.conversation); setActiveId(body.conversation.id);
      setAttachments([]);
      onConversationChange(body.conversation.id);
    } catch (reason) { setInput(message);setError(reason instanceof Error ? reason.message : "消息处理失败"); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent) { event.preventDefault(); await send(input); }

  async function confirmSearch(actionId: string) {
    const retrying = conversation?.actions.find((action) => action.id === actionId)?.status === "failed";
    if (!window.confirm(retrying
      ? "从已保留的 checkpoint 重试该工作流？"
      : "确认执行 LangGraph 销售线索工作流？系统会先调用三类知识 RAG，再按候选类别执行混合搜索和轻量门禁；Tavily 仅用于定向补证，最后由独立评分 Agent 评估候选。")) return;
    setConfirmingId(actionId); setError("");
    try {
      const response = await fetch(`/api/assistant/actions/${actionId}/confirm`, { method: "POST" });
      const body = await response.json() as { conversation?: AssistantConversationDto; error?: string };
      if (body.conversation) {
        setConversation(body.conversation);
        onConversationChange(body.conversation.id);
      }
      if (!response.ok) throw new Error(body.error ?? "搜索执行失败");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "搜索执行失败"); }
    finally { setConfirmingId(undefined); }
  }

  const messages = conversation?.messages ?? [];
  const actions = conversation?.actions ?? [];
  const greeting = useMemo(() => new Date().getHours() < 12 ? "早上好" : new Date().getHours() < 18 ? "下午好" : "晚上好", []);

  return <div className="ai-home-shell">
    <section className="ai-chat-panel">
      <div className="ai-message-stream" ref={scrollRef}>
        {activeId && <AgentRuns conversationId={activeId} onUpdated={refreshAgentConversation} />}
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
              {message.metadata.budgetProposal&&<BudgetProposalCard proposal={message.metadata.budgetProposal} actions={actions}/>}
              {message.metadata.productAction&&<div className="ai-action-card">{message.metadata.productAction.companies.map(company=><button key={company.id} onClick={()=>onOpenCompany(company.id,message.metadata.productAction!.kind)}>{company.name} · {company.countryCode} · {message.metadata.productAction!.kind==="library"?"公司详情":message.metadata.productAction!.kind==="strategy"?"开发策略":"邮件与跟进"}</button>)}{message.metadata.productAction.hasMore&&<p>仅列出最近 20 家，请补充公司名称或市场缩小范围。</p>}</div>}
              {action && <div className={`ai-action-card ${action.status}`}>
                <div className="ai-action-head"><div><span>{action.payload.countryCode}</span><strong>{action.payload.countryName} 销售线索计划</strong></div><em>{searchTaskStatusLabel(action.status,taskCounts(action.result).accepted,action.payload.targetCount)}</em></div>
                <dl><div><dt>开发模式</dt><dd>{action.payload.objective === "new-market" ? "新市场并行开发" : "已有分销体系增长"}</dd></div><div><dt>目标数量</dt><dd>{action.payload.targetCount} 家</dd></div><div><dt>渠道角色</dt><dd>{action.payload.roles.join(" · ")}</dd></div></dl>
                {action.status === "proposed" && <button disabled={confirmingId === action.id} onClick={() => void confirmSearch(action.id)}>{confirmingId === action.id ? "正在启动工作流…" : "确认并开始搜索"}</button>}
                {action.status === "failed" && <button disabled={confirmingId === action.id} onClick={() => void confirmSearch(action.id)}>{confirmingId === action.id ? "正在恢复工作流…" : "从 checkpoint 重试"}</button>}
                {action.status === "completed" && <button onClick={() => onOpenResults(action.payload.countryCode)}>查看 {action.payload.countryName} 结果</button>}
                {action.errorMessage && <p>{action.errorMessage}</p>}
                <button onClick={()=>setTaskId(action.id)}>查看任务详情</button>
              </div>}
              {(message.metadata.citations?.length ?? 0) > 0 && <div className="ai-citations"><strong>知识库证据</strong>{message.metadata.citations?.map((citation) => <a key={citation.chunkId} href={citation.sourceUrl || undefined} target="_blank" rel="noreferrer"><span>[KB:{citation.chunkId.slice(0, 8)}]</span><b>{citation.documentTitle}</b><em>{Math.round(citation.score * 100)}%</em></a>)}</div>}
              {(message.metadata.knowledge?.documents.length ?? 0) > 0 && <div className="ai-citations"><strong>原始资料</strong>{message.metadata.knowledge?.documents.map((document) => <a key={document.assetId} href={document.url} target="_blank" rel="noreferrer"><span>{document.documentType}</span><b>{document.title}</b><em>{document.version ?? "未标注版本"}</em></a>)}</div>}
              {(message.metadata.knowledge?.factCitations.length ?? 0) > 0 && <div className="ai-citations"><strong>已验证事实</strong>{message.metadata.knowledge?.factCitations.map((citation) => <a key={citation.factId} href={`/api/knowledge/assets/${citation.assetId}`} target="_blank" rel="noreferrer"><span>{citation.attributeKey}</span><b>{citation.rawValue}</b><em>{citation.version ?? citation.status}</em></a>)}</div>}
              {(message.metadata.webCitations?.length ?? 0) > 0 && <div className="ai-citations"><strong>外部网页证据</strong>{message.metadata.webCitations?.map((citation, index) => <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer"><span>[WEB:{index + 1}]</span><b>{citation.title}</b></a>)}</div>}
              {message.metadata.grounded === false && <small className="ai-evidence-warning">回答尚未获得充分引用，请人工复核。</small>}
            </div>
          </article>;
        })}
        {busy && <p className="ai-submit-state" role="status">正在保存任务…</p>}
      </div>
      {error && <div className="ai-chat-error">{error}</div>}
      <form className="ai-composer" onSubmit={submit}><AgentAttachments selected={attachments} onChange={setAttachments}/><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); } }} placeholder="询问产品、结合网页调研，或描述销售线索目标…" rows={1}/><div><span>支持多轮纠正 · 线索搜索执行前需确认</span><button disabled={busy || !input.trim()} aria-label="发送">↑</button></div></form>
    </section>
    {taskId&&<TaskDetailView key={taskId} id={taskId} kind="search" onClose={()=>setTaskId(undefined)}/>}
  </div>;
}
