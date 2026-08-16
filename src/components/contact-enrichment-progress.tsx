"use client";

import { useEffect, useMemo, useState } from "react";

type ItemStatus = "pending" | "running" | "completed" | "failed";

interface ProgressItem {
  id: string;
  companyName: string;
  domain: string;
  status: ItemStatus;
  phase: string;
  workerId: string | null;
  attempts: number;
  namedContactCount: number;
  emailCount: number;
  errorMessage: string | null;
  updatedAt: string;
}

interface ProgressPayload {
  run: null | {
    id: string;
    status: "running" | "completed" | "failed" | "cancelled";
    targetCount: number;
    processedCount: number;
    searchCreditsUsed: number;
    extractCreditsUsed: number;
    errorMessage: string | null;
    startedAt: string;
    finishedAt: string | null;
  };
  items: ProgressItem[];
  counts: Record<ItemStatus, number>;
  error?: string;
}

const phaseLabels: Record<string, string> = {
  queued: "等待调度",
  "official-search": "搜索公司官网",
  "contact-search": "搜索关键联系人",
  "email-search": "搜索公开邮箱",
  extract: "提取网页证据",
  persist: "保存联系人与证据",
  completed: "已完成",
  failed: "搜索失败",
};

function elapsed(startedAt: string, finishedAt: string | null): string {
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${seconds % 60} 秒`;
}

export function ContactEnrichmentProgress() {
  const [data, setData] = useState<ProgressPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const response = await fetch("/api/contact-enrichment/runs/latest", { cache: "no-store" });
        const payload = await response.json() as ProgressPayload;
        if (!response.ok) throw new Error(payload.error ?? "读取任务进度失败");
        if (!active) return;
        setData(payload);
        setLoadError(null);
        timer = setTimeout(load, payload.run?.status === "running" ? 1500 : 8000);
      } catch (error) {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : "读取任务进度失败");
        timer = setTimeout(load, 8000);
      }
    };
    void load();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, []);

  const activeItems = useMemo(() => data?.items.filter((item) => item.status === "running") ?? [], [data]);
  const recentItems = useMemo(() => data?.items.filter((item) => item.status !== "running").slice(0, 12) ?? [], [data]);

  if (loadError && !data) return <div className="inline-notice enrichment-error">{loadError}</div>;
  if (!data) return <div className="panel enrichment-loading"><span />正在读取搜索任务…</div>;
  if (!data.run) return <div className="panel enrichment-empty"><strong>还没有联系人搜索任务</strong><p>启动搜索后，这里会实时显示当前公司和处理阶段。</p></div>;

  const terminalCount = data.items.length > 0
    ? data.counts.completed + data.counts.failed
    : data.run.processedCount;
  const percent = Math.min(100, Math.round((terminalCount / data.run.targetCount) * 100));
  const contactTotal = data.items.reduce((sum, item) => sum + item.namedContactCount, 0);
  const emailTotal = data.items.reduce((sum, item) => sum + item.emailCount, 0);
  const legacyRun = data.items.length === 0;

  return (
    <div className="enrichment-layout">
      <section className="panel enrichment-hero">
        <div className="enrichment-hero-head">
          <div><span className={`run-state ${data.run.status}`}><i />{data.run.status === "running" ? "搜索进行中" : data.run.status === "completed" ? "搜索完成" : data.run.status === "failed" ? "部分失败" : "已取消"}</span><h2>联系人搜索进度</h2><p>批次 {data.run.id.slice(0, 8)} · 已运行 {elapsed(data.run.startedAt, data.run.finishedAt)}</p></div>
          <strong>{percent}<small>%</small></strong>
        </div>
        <div className="enrichment-progress-track" aria-label={`任务完成 ${percent}%`}><span style={{ width: `${percent}%` }} /></div>
        <div className="enrichment-progress-copy"><span>{terminalCount} / {data.run.targetCount} 家已处理</span><span>{data.counts.pending} 排队 · {data.counts.running} 处理中 · {data.counts.failed || (data.run.targetCount - data.run.processedCount)} 失败</span></div>
        {legacyRun && <div className="legacy-run-note">这是升级前的历史批次：已保留 {data.run.processedCount} 家成功结果。下一次续跑将显示逐公司实时状态。</div>}
      </section>

      <section className="enrichment-metrics">
        <article><span>成功公司</span><strong>{legacyRun ? data.run.processedCount : data.counts.completed}</strong><small>不重复搜索</small></article>
        <article><span>发现联系人</span><strong>{contactTotal}</strong><small>具名联系人</small></article>
        <article><span>发现邮箱</span><strong>{emailTotal}</strong><small>含待验证邮箱</small></article>
        <article><span>搜索消耗</span><strong>{data.run.searchCreditsUsed + data.run.extractCreditsUsed}</strong><small>{data.run.searchCreditsUsed} search · {data.run.extractCreditsUsed} extract</small></article>
      </section>

      <div className="enrichment-columns">
        <section className="panel worker-panel">
          <header><div><span className="section-kicker">LIVE WORKERS</span><h2>当前搜索公司</h2></div><em>{activeItems.length} 个 worker 活跃</em></header>
          <div className="worker-list">
            {activeItems.map((item) => <article key={item.id} className="worker-row"><span className="worker-pulse"/><div><strong>{item.companyName}</strong><small>{item.domain}</small></div><div><b>{item.workerId ?? "worker"}</b><small>{phaseLabels[item.phase] ?? item.phase}</small></div></article>)}
            {activeItems.length === 0 && <div className="worker-idle"><span>✓</span><strong>当前没有正在搜索的公司</strong><p>{data.run.status === "failed" ? "失败公司可以安全续跑，已完成结果会保留。" : "新任务启动后会自动显示各 worker 的当前公司。"}</p></div>}
          </div>
        </section>

        <section className="panel activity-panel">
          <header><div><span className="section-kicker">RECENT ACTIVITY</span><h2>最近任务明细</h2></div><span>自动刷新</span></header>
          <div className="activity-list">
            {recentItems.map((item) => <article key={item.id}><span className={`activity-state ${item.status}`}>{item.status === "completed" ? "完成" : item.status === "failed" ? "失败" : "排队"}</span><div><strong>{item.companyName}</strong><small>{item.status === "completed" ? `${item.namedContactCount} 位联系人 · ${item.emailCount} 个邮箱` : item.errorMessage ?? phaseLabels[item.phase] ?? item.phase}</small></div><time>{new Date(item.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time></article>)}
            {recentItems.length === 0 && <div className="activity-empty">暂无逐公司任务记录</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
