"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function LoginScreen({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("owner@network-copilot.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "登录失败");
      setPassword("");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败");
    } finally { setLoading(false); }
  }

  return <main className="login-page">
    <section className="login-card">
      <div className="login-brand"><span>N</span><div><strong>Network Copilot</strong><small>Global AI Sales Workspace</small></div></div>
      <div><span className="section-kicker">SECURE WORKSPACE</span><h1>登录销售线索工作台</h1><p>每位用户拥有独立工作区，邮箱、客户资料和知识库不会与其他用户互通。</p></div>
      {!configured ? <div className="login-config-error"><strong>尚未配置用户账号</strong><p>由管理员使用 <code>npm run users:upsert</code> 创建账号。</p></div> :
        <form onSubmit={submit}><label htmlFor="workspace-email">登录邮箱</label><input id="workspace-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus/><label htmlFor="workspace-password">密码</label><input id="workspace-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required/><button className="primary-button" disabled={loading}>{loading ? "正在验证…" : "登录"}</button>{error && <p className="login-error">{error}</p>}</form>}
      <small className="login-foot">密码不会发送给第三方模型或搜索服务。</small>
    </section>
  </main>;
}
