"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

interface Connection {
  id: string;
  email: string;
  status: "active" | "error" | "disabled";
  lastVerifiedAt?: string;
  lastError?: string;
}

interface MailboxStatus {
  configured: boolean;
  kimiConfigured: boolean;
  kimiModel: string;
  messages: number;
  pendingCandidates: number;
  candidates: { policies: number; customers: number; templates: number };
  latestRun: null | {
    id: string;
    status: string;
    phase: string;
    folder_count: number;
    imported_count: number;
    skipped_count: number;
    discovered_count: number;
    processed_count: number;
    learning_total: number;
    learning_processed: number;
    learning_failed: number;
    candidate_count: number;
    current_subject: string | null;
    model: string | null;
    error_message: string | null;
    started_at: string;
    finished_at: string | null;
  };
  recentMessages: Array<{
    id: string;
    subject: string;
    excerpt: string;
    direction: "inbound" | "outbound";
    learning_status: "pending" | "analyzing" | "completed" | "failed" | "skipped" | "blocked";
    learning_error: string | null;
    updated_at: string;
  }>;
}

interface Candidate {
  id: string;
  kind: "company-policy" | "customer-signal" | "email-template";
  title: string;
  excerpt: string;
  created_at: string;
  confidence: number | null;
  rationale: string | null;
  model: string | null;
}

const phaseLabels: Record<string, string> = {
  queued: "等待启动", connecting: "连接阿里邮箱", discovering: "发现邮件文件夹",
  fetching: "安全导入邮件", "awaiting-review": "本地导入完成，等待逐封授权", learning: "Kimi-K3 学习提取", completed: "导入与学习完成",
  "completed-with-errors": "完成（部分邮件学习失败）", failed: "同步失败",
};

function progressPercent(run: NonNullable<MailboxStatus["latestRun"]>): number {
  if (run.status === "completed") return 100;
  if (run.phase === "queued") return 2;
  if (run.phase === "connecting") return 7;
  if (run.phase === "discovering") return 14;
  if (run.phase === "fetching") {
    return Math.min(48, 18 + Math.round((run.processed_count / Math.max(run.discovered_count, 1)) * 30));
  }
  if (run.phase === "awaiting-review") return 50;
  if (run.phase === "learning") {
    return Math.min(98, 50 + Math.round((run.learning_processed / Math.max(run.learning_total, 1)) * 48));
  }
  return run.status === "failed" ? Math.max(5, Math.min(99, run.processed_count)) : 0;
}

export function MailboxIntegration() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [status, setStatus] = useState<MailboxStatus | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [email, setEmail] = useState("");
  const [securityPassword, setSecurityPassword] = useState("");
  const [busy, setBusy] = useState<"connect" | "sync" | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [learningId, setLearningId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const [connectionResponse, statusResponse, candidateResponse] = await Promise.all([
      fetch("/api/mailbox/connections", { cache: "no-store" }),
      fetch("/api/mailbox/status", { cache: "no-store" }),
      fetch("/api/mailbox/candidates", { cache: "no-store" }),
    ]);
    if (connectionResponse.ok) setConnections((await connectionResponse.json() as { connections: Connection[] }).connections);
    if (statusResponse.ok) setStatus(await statusResponse.json() as MailboxStatus);
    if (candidateResponse.ok) setCandidates((await candidateResponse.json() as { candidates: Candidate[] }).candidates);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (busy !== "sync" && status?.latestRun?.status !== "running") return;
    let active = true;
    const timer = window.setInterval(() => { if (active) void refresh(); }, 1_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [busy, refresh, status?.latestRun?.status]);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("connect"); setMessage("");
    try {
      const response = await fetch("/api/mailbox/connections", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, securityPassword }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "连接失败");
      setSecurityPassword(""); setMessage("邮箱连接验证成功。安全密码已加密保存。");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "连接失败"); }
    finally { setBusy(null); }
  }

  async function sync(connectionId: string) {
    setBusy("sync"); setMessage("");
    try {
      const response = await fetch("/api/mailbox/sync", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId, lookbackDays: 365, maxMessages: 200 }),
      });
      const body = await response.json() as { error?: string; imported?: number; skipped?: number; awaitingReview?: number };
      if (!response.ok) throw new Error(body.error ?? "同步失败");
      setMessage(`本地同步完成：新增 ${body.imported ?? 0} 封，已存在 ${body.skipped ?? 0} 封，${body.awaitingReview ?? 0} 封等待你决定是否交给 Kimi。`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "同步失败"); }
    finally { setBusy(null); }
  }

  async function decideMessage(messageId: string, action: "authorize" | "skip") {
    setMessage(""); setLearningId(messageId);
    try {
      const response = await fetch(`/api/mailbox/messages/${messageId}/learning`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, consent: action === "authorize" }),
      });
      const body = await response.json() as { error?: string; status?: string; candidates?: number; reason?: string };
      if (!response.ok) throw new Error(body.error ?? "邮件处理失败");
      setMessage(body.status === "blocked" ? body.reason ?? "检测到高风险内容，未发送给 Kimi。"
        : action === "skip" ? "已跳过；该邮件未发送给 Kimi。"
          : `脱敏学习完成，生成 ${body.candidates ?? 0} 条待审核候选。`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "邮件处理失败"); }
    finally { setLearningId(null); }
  }

  async function review(candidateId: string, kind: Candidate["kind"], reviewStatus: "approved" | "rejected") {
    setMessage("");
    setReviewingId(candidateId);
    try {
      const response = await fetch(`/api/mailbox/candidates/${candidateId}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: reviewStatus }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "审核失败");
      setCandidates((items) => items.filter((item) => item.id !== candidateId));
      setMessage(reviewStatus === "approved"
        ? kind === "customer-signal" ? "客户信号已写入当前用户的私有知识库。" : "候选已批准并写入当前用户的私有知识范围。"
        : "候选已拒绝。");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "审核失败"); }
    finally { setReviewingId(null); }
  }

  const run = status?.latestRun ?? null;
  const percent = run ? progressPercent(run) : 0;

  return <div className="mailbox-grid">
    <section className="panel mailbox-connect-panel">
      <div className="panel-header"><div><span className="section-kicker">PRIVATE MAILBOX</span><h2>连接阿里邮箱</h2></div><span className="tag green">只读 IMAP</span></div>
      <p className="mailbox-description">使用阿里邮箱网页端生成的第三方客户端安全密码。系统只读取收件箱和已发送邮件，不修改已读状态、不下载附件，也不会发送邮件。</p>
      {status && !status.configured && <div className="login-config-error"><strong>服务端加密密钥未配置</strong><p>请先设置 <code>MAILBOX_CREDENTIAL_KEY</code> 并重启服务。</p></div>}
      <form className="mailbox-form" onSubmit={connect}>
        <label>阿里邮箱地址<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" required/></label>
        <label>第三方客户端安全密码<input type="password" autoComplete="new-password" value={securityPassword} onChange={(event) => setSecurityPassword(event.target.value)} required/></label>
        <button className="primary-button" disabled={busy !== null || status?.configured === false}>{busy === "connect" ? "正在验证…" : "验证并连接"}</button>
      </form>
      {message && <p className="mailbox-message">{message}</p>}
    </section>

    <section className="panel mailbox-status-panel">
      <div className="panel-header"><div><span className="section-kicker">SYNC & REVIEW</span><h2>私有学习候选</h2></div></div>
      <div className="mailbox-metrics">
        <div><strong>{status?.messages ?? 0}</strong><span>已保存邮件</span></div>
        <div><strong>{status?.candidates.policies ?? 0}</strong><span>政策候选</span></div>
        <div><strong>{status?.candidates.customers ?? 0}</strong><span>客户信号</span></div>
        <div><strong>{status?.candidates.templates ?? 0}</strong><span>模板候选</span></div>
      </div>
      {run && <div className="mailbox-pipeline">
        <div className="mailbox-pipeline-head">
          <div><span className={`run-state ${run.status}`}><i />{phaseLabels[run.phase] ?? run.phase}</span><strong>本地导入与授权学习</strong><small>外发模型 {status?.kimiModel ?? "kimi-k3"} · 批次 {run.id.slice(0, 8)}</small></div>
          <b>{percent}<small>%</small></b>
        </div>
        <div className="mailbox-progress-track" aria-label={`邮箱学习完成 ${percent}%`}><span style={{ width: `${percent}%` }} /></div>
        <div className="mailbox-stage-grid">
          <div className={run.phase === "connecting" || run.phase === "discovering" || run.phase === "fetching" ? "active" : run.learning_total > 0 || run.status === "completed" ? "done" : ""}><span>1</span><strong>发现与导入</strong><small>{run.processed_count} / {run.discovered_count} 封</small></div>
          <div className={run.phase === "awaiting-review" || run.phase === "learning" ? "active" : ""}><span>2</span><strong>逐封授权</strong><small>{run.learning_total} 封待决定</small></div>
          <div className={run.candidate_count > 0 ? "active" : run.status === "completed" ? "done" : ""}><span>3</span><strong>人工审核</strong><small>{status?.pendingCandidates ?? 0} 条待决定</small></div>
        </div>
        {run.current_subject && <div className="mailbox-current"><i /><span>正在处理</span><strong>{run.current_subject}</strong></div>}
        {run.error_message && <div className="mailbox-run-error">{run.error_message}</div>}
        {(status?.recentMessages.length ?? 0) > 0 && <div className="mailbox-live-list">
          {status?.recentMessages.slice(0, 16).map((item) => <article key={item.id}>
            <div className="mailbox-message-summary">
              <span className={`mail-learning-state ${item.learning_status}`}>{item.learning_status === "completed" ? "已提取" : item.learning_status === "analyzing" ? "Kimi分析" : item.learning_status === "failed" ? "失败" : item.learning_status === "skipped" ? "已跳过" : item.learning_status === "blocked" ? "已阻止" : "待授权"}</span>
              <strong>{item.subject || "无主题邮件"}</strong><small>{item.direction === "inbound" ? "收件" : "已发送"}</small>
            </div>
            <p>{item.excerpt || "无正文预览"}</p>
            {(item.learning_status === "pending" || item.learning_status === "failed") && <div className="mailbox-message-actions">
              <button className="secondary-button" disabled={learningId === item.id} onClick={() => decideMessage(item.id, "skip")}>跳过，不外发</button>
              <button className="primary-button" disabled={learningId === item.id || status?.kimiConfigured === false} onClick={() => decideMessage(item.id, "authorize")}>{learningId === item.id ? "处理中…" : "同意脱敏后交给 Kimi"}</button>
            </div>}
            {item.learning_error && <small className="mailbox-rationale">{item.learning_error}</small>}
          </article>)}
        </div>}
      </div>}
      <p className="mailbox-description">同步只把邮件保存到本地私有区。只有你逐封点击同意后，系统才会移除收发地址、引用历史并脱敏敏感字段，再发送给 Kimi；提取结果仍需第二次批准才进入私有知识库。</p>
      {status && !status.kimiConfigured && <div className="login-config-error"><strong>Kimi 学习服务未配置</strong><p>请先设置 <code>KIMI_API_KEY</code>，再启动邮箱学习。</p></div>}
      <div className="mailbox-connections">
        {connections.map((connection) => <article key={connection.id}>
          <div><strong>{connection.email}</strong><small>{connection.status === "active" ? "连接有效" : connection.lastError ?? connection.status}</small></div>
          <button className="secondary-button" disabled={busy !== null || run?.status === "running"} onClick={() => sync(connection.id)}>{busy === "sync" || run?.status === "running" ? "本地同步中…" : "仅本地同步最近一年"}</button>
        </article>)}
        {connections.length === 0 && <p className="subtle">尚未连接邮箱。</p>}
      </div>
      {run && <small className="mailbox-last-run">最近同步：{phaseLabels[run.phase] ?? run.status} · 发现 {run.discovered_count} · 新增 {run.imported_count} · 此同步过程未自动外发</small>}
    </section>
    <section className="panel mailbox-review-panel">
      <div className="panel-header"><div><span className="section-kicker">HUMAN REVIEW</span><h2>待审核内容</h2></div><span className="tag amber">{candidates.length}</span></div>
      <div className="mailbox-candidate-list">
        {candidates.map((candidate) => <article key={candidate.id}>
          <div className="mailbox-candidate-head"><span className="tag neutral">{{ "company-policy": "公司政策", "customer-signal": "客户信号", "email-template": "邮件模板" }[candidate.kind]}</span><small>{candidate.created_at.slice(0, 10)}</small></div>
          <strong>{candidate.title || "无主题邮件"}</strong><p>{candidate.excerpt}</p>
          <div className="mailbox-ai-meta"><span>{candidate.model ?? "kimi-k3"}</span>{candidate.confidence !== null && <span>置信度 {Math.round(candidate.confidence * 100)}%</span>}</div>
          {candidate.rationale && <small className="mailbox-rationale">{candidate.rationale}</small>}
          <div><button className="secondary-button" disabled={reviewingId === candidate.id} onClick={() => review(candidate.id, candidate.kind, "rejected")}>拒绝</button><button className="primary-button" disabled={reviewingId === candidate.id} onClick={() => review(candidate.id, candidate.kind, "approved")}>{reviewingId === candidate.id ? "处理中…" : "批准进入私有知识库"}</button></div>
        </article>)}
        {candidates.length === 0 && <p className="subtle">暂无待审核候选。请先在上方逐封授权脱敏学习，提取结果会显示在这里。</p>}
      </div>
    </section>
  </div>;
}
