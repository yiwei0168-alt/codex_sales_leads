"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function LoginScreen({ configured }: { configured: boolean }) {
  const router = useRouter();
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
        body: JSON.stringify({ password }),
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
      <div className="login-brand"><span>N</span><div><strong>Network Copilot</strong><small>Mexico Market Pilot</small></div></div>
      <div><span className="section-kicker">SECURE WORKSPACE</span><h1>登录销售线索工作台</h1><p>首版为单用户试点。市场项目、线索判断和销售进度将保存到阿里云 RDS。</p></div>
      {!configured ? <div className="login-config-error"><strong>尚未配置登录密码</strong><p>生成密码哈希并将其配置为服务端环境变量 <code>APP_PASSWORD_HASH</code>。</p></div> :
        <form onSubmit={submit}><label htmlFor="workspace-password">工作台密码</label><input id="workspace-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required autoFocus/><button className="primary-button" disabled={loading}>{loading ? "正在验证…" : "登录"}</button>{error && <p className="login-error">{error}</p>}</form>}
      <small className="login-foot">密码不会发送给第三方模型或搜索服务。</small>
    </section>
  </main>;
}
