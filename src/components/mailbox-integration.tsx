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
  messages: number;
  candidates: { policies: number; customers: number; templates: number };
  latestRun: null | {
    status: string;
    imported_count: number;
    discovered_count: number;
  };
}

interface Candidate {
  id: string;
  kind: "company-policy" | "customer-signal" | "email-template";
  title: string;
  excerpt: string;
  created_at: string;
}

export function MailboxIntegration() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [status, setStatus] = useState<MailboxStatus | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [email, setEmail] = useState("");
  const [securityPassword, setSecurityPassword] = useState("");
  const [busy, setBusy] = useState<"connect" | "sync" | null>(null);
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
      const body = await response.json() as { error?: string; imported?: number; skipped?: number };
      if (!response.ok) throw new Error(body.error ?? "同步失败");
      setMessage(`同步完成：新增 ${body.imported ?? 0} 封，已存在 ${body.skipped ?? 0} 封。`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "同步失败"); }
    finally { setBusy(null); }
  }

  async function review(candidateId: string, kind: Candidate["kind"], reviewStatus: "approved" | "rejected") {
    setMessage("");
    try {
      const response = await fetch(`/api/mailbox/candidates/${candidateId}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: reviewStatus }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "审核失败");
      setCandidates((items) => items.filter((item) => item.id !== candidateId));
      setMessage(reviewStatus === "approved"
        ? kind === "customer-signal" ? "客户信号已确认为当前用户的私有数据。" : "候选已批准并写入当前用户的私有知识范围。"
        : "候选已拒绝。");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "审核失败"); }
  }

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
      <p className="mailbox-description">所有提取结果先进入当前用户的待审核区，不会自动写入其他用户知识库或客户库。</p>
      <div className="mailbox-connections">
        {connections.map((connection) => <article key={connection.id}>
          <div><strong>{connection.email}</strong><small>{connection.status === "active" ? "连接有效" : connection.lastError ?? connection.status}</small></div>
          <button className="secondary-button" disabled={busy !== null} onClick={() => sync(connection.id)}>{busy === "sync" ? "同步中…" : "同步最近一年"}</button>
        </article>)}
        {connections.length === 0 && <p className="subtle">尚未连接邮箱。</p>}
      </div>
      {status?.latestRun && <small className="mailbox-last-run">最近同步：{status.latestRun.status} · 发现 {status.latestRun.discovered_count} · 新增 {status.latestRun.imported_count}</small>}
    </section>
    <section className="panel mailbox-review-panel">
      <div className="panel-header"><div><span className="section-kicker">HUMAN REVIEW</span><h2>待审核内容</h2></div><span className="tag amber">{candidates.length}</span></div>
      <div className="mailbox-candidate-list">
        {candidates.map((candidate) => <article key={candidate.id}>
          <div className="mailbox-candidate-head"><span className="tag neutral">{{ "company-policy": "公司政策", "customer-signal": "客户信号", "email-template": "邮件模板" }[candidate.kind]}</span><small>{candidate.created_at.slice(0, 10)}</small></div>
          <strong>{candidate.title || "无主题邮件"}</strong><p>{candidate.excerpt}</p>
          <div><button className="secondary-button" onClick={() => review(candidate.id, candidate.kind, "rejected")}>拒绝</button><button className="primary-button" onClick={() => review(candidate.id, candidate.kind, "approved")}>批准</button></div>
        </article>)}
        {candidates.length === 0 && <p className="subtle">暂无待审核候选。同步邮箱后，系统会在这里展示提取结果。</p>}
      </div>
    </section>
  </div>;
}
