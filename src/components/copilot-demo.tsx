"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AssistantHome } from "@/components/assistant-home";
import { KnowledgeBase } from "@/components/knowledge-base";
import { ContactEnrichmentProgress } from "@/components/contact-enrichment-progress";
import { MailboxIntegration } from "@/components/mailbox-integration";
import {
  primaryRole,
  priorityIndex,
  type AccountTier,
  type ChannelRole,
  type CompanyRecord,
  type ChannelRelationship,
  type Evidence,
  type OpportunityStage,
  type SupplyModel,
} from "@/lib/domain";
import type {
  CompanyContactDetailsDto,
  CompanyEditablePatch,
  ContactStatus,
  EmailCandidateStatus,
  MarketWorkspaceDto,
} from "@/lib/sales/types";
import type { DevelopmentStrategyDto } from "@/lib/outreach/types";

type View = "home" | "overview" | "results" | "map" | "opportunities" | "assistant" | "tasks" | "knowledge" | "mailbox";
type Mode = "new-market" | "growth";
type SearchState = "idle" | "retrieving" | "complete";

const roleOptions: ChannelRole[] = [
  "Distributor", "VAD", "VAR", "Dealer", "Reseller", "Retailer", "E-tailer", "SI", "Installer", "MSP", "ISP",
];
const supplyOptions: SupplyModel[] = ["Distributor Supply", "Brand Direct", "Co-sell/Co-supply", "TBD"];
const tierOptions: AccountTier[] = ["KA", "Priority", "Standard", "Long-tail"];
const stageOptions: OpportunityStage[] = ["Discovered", "Qualified", "Priority", "Contact Prepared", "Engaged", "Excluded"];
const liveRelationships: ChannelRelationship[] = [];

const icons: Record<string, React.ReactNode> = {
  home: <><path d="m4 11 8-7 8 7v9H4z"/><path d="M9 20v-6h6v6"/></>,
  overview: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></>,
  results: <><path d="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" /></>,
  map: <><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="m7 7 4 9m6-9-4 9M7 6h10"/></>,
  opportunities: <><path d="M4 7h16v13H4zM8 7V4h8v3M4 12h16M10 12v2h4v-2" /></>,
  assistant: <><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="4"/></>,
  tasks: <><path d="M5 4h14v16H5zM8 8h8M8 12h5M8 16h3"/><path d="m15 16 1.5 1.5L20 14"/></>,
  knowledge: <><path d="M4 5c3-1.4 5.7-1.2 8 .6V20c-2.3-1.8-5-2-8-.6V5Zm16 0c-3-1.4-5.7-1.2-8 .6V20c2.3-1.8 5-2 8-.6V5Z"/><path d="M8 9h1m-1 3h1m6-3h1m-1 3h1"/></>,
  mailbox: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></>,
  spark: <><path d="m12 2 1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6L12 2Zm7 13 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></>,
  external: <><path d="M14 4h6v6m0-6-9 9M18 13v7H4V6h7" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  chevron: <><path d="m9 18 6-6-6-6" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  filter: <><path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>;
}

function ScoreRing({ value, compact = false }: { value: number; compact?: boolean }) {
  const color = value >= 85 ? "var(--mint)" : value >= 72 ? "var(--amber)" : "var(--slate-400)";
  return (
    <div className={compact ? "score-ring compact" : "score-ring"} style={{ "--score": `${value * 3.6}deg`, "--score-color": color } as React.CSSProperties}>
      <span>{value}</span>
    </div>
  );
}

function StatusTag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "green" | "blue" | "amber" | "violet" | "neutral" | "red" }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

function MiniBar({ value, tone = "mint" }: { value: number; tone?: "mint" | "blue" | "amber" }) {
  return <div className="mini-bar" aria-label={`${value}%`}><span className={tone} style={{ width: `${value}%` }} /></div>;
}

function contactStatusTone(status: ContactStatus): "green" | "blue" | "amber" {
  return status === "Verified" ? "green" : status === "Public" ? "blue" : "amber";
}

function emailStatusTone(status: EmailCandidateStatus): "green" | "blue" | "amber" | "violet" | "red" {
  if (status === "Verified") return "green";
  if (status === "Public") return "blue";
  if (status === "Pattern-guessed") return "violet";
  if (status === "Invalid") return "red";
  return "amber";
}

function providerLabel(provider: string): string {
  return ({
    snov: "Snov.io",
    "official-website": "官网",
    "tavily-web-search": "网页搜索",
    "deterministic-pattern": "邮箱规则猜测",
    "tavily-search": "Tavily Search",
    "tavily-extract": "Tavily Extract",
  } as Record<string, string>)[provider] ?? provider;
}

export function CopilotDemo({ initialWorkspace, userName = "Workspace Owner" }: { initialWorkspace?: MarketWorkspaceDto; userName?: string }) {
  const router = useRouter();
  const [view, setView] = useState<View>("home");
  const [mode, setMode] = useState<Mode>(initialWorkspace?.mode ?? "new-market");
  const [companies, setCompanies] = useState<CompanyRecord[]>(initialWorkspace?.companies ?? []);
  const [selectedId, setSelectedId] = useState("syscom");
  const [detailOpen, setDetailOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState<Evidence | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"All" | ChannelRole>("All");
  const [tierFilter, setTierFilter] = useState<"All" | AccountTier>("All");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [draft, setDraft] = useState("");
  const [developmentResult, setDevelopmentResult] = useState<DevelopmentStrategyDto | null>(null);
  const [developmentState, setDevelopmentState] = useState<"idle" | "generating" | "ready" | "revising" | "approving" | "approved" | "error">("idle");
  const [developmentError, setDevelopmentError] = useState("");
  const [developmentFeedback, setDevelopmentFeedback] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [allowFeedbackMemory, setAllowFeedbackMemory] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const sourceCount = companies.reduce((total, company) => total + company.evidence.length, 0);
  const searchDate = initialWorkspace?.latestSearch?.finishedAt?.slice(0, 10) ?? "Not searched";

  const selectedCompany = companies.find((item) => item.id === selectedId) ?? companies[0];
  const shortlist = companies.filter((company) => !["Discovered", "Excluded"].includes(company.opportunityStage));

  const filteredCompanies = useMemo(() => {
    const term = query.trim().toLowerCase();
    return companies
      .filter((company) => roleFilter === "All" || company.roles.includes(roleFilter))
      .filter((company) => tierFilter === "All" || company.accountTier === tierFilter)
      .filter((company) => !term || [company.displayName, company.city, company.domain, company.roles.join(" ")].join(" ").toLowerCase().includes(term))
      .sort((a, b) => priorityIndex(b) - priorityIndex(a));
  }, [companies, query, roleFilter, tierFilter]);

  async function updateCompany(id: string, patch: CompanyEditablePatch) {
    setCompanies((items) => items.map((item) => item.id === id ? { ...item, ...patch, manuallyEdited: true } : item));
    setSaveState("saving");
    try {
      const response = await fetch(`/api/workspaces/current/companies/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error("保存失败");
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1600);
    } catch {
      setSaveState("error");
    }
  }

  function selectCompany(id: string, openDrawer = true) {
    setSelectedId(id);
    setDraft("");
    setDevelopmentResult(null);
    setDevelopmentState("idle");
    setDevelopmentError("");
    setDevelopmentFeedback("");
    setFeedbackMessage("");
    setAllowFeedbackMemory(false);
    if (openDrawer) setDetailOpen(true);
  }

  async function generateDevelopment(company = selectedCompany) {
    if (!company || developmentState === "generating") return;
    setDevelopmentState("generating");
    setDevelopmentError("");
    try {
      const response = await fetch("/api/development-strategies", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyExternalId: company.id, language: "en", tone: "consultative" }),
      });
      const payload = await response.json() as { result?: DevelopmentStrategyDto; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || "开发策略生成失败");
      setDevelopmentResult(payload.result);
      setDraft(payload.result.draft.body);
      setDevelopmentFeedback("");
      setFeedbackMessage("");
      setAllowFeedbackMemory(false);
      setDevelopmentState("ready");
    } catch (error) {
      setDevelopmentState("error");
      setDevelopmentError(error instanceof Error ? error.message : "开发策略生成失败");
    }
  }

  async function approveDevelopmentDraft() {
    if (!developmentResult || developmentState === "approving") return;
    setDevelopmentState("approving");
    setDevelopmentError("");
    try {
      const response = await fetch(`/api/development-strategies/${developmentResult.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft, approve: true }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "草稿批准失败");
      setDevelopmentResult({ ...developmentResult, status: "approved", draft: { ...developmentResult.draft, body: draft } });
      setDevelopmentState("approved");
    } catch (error) {
      setDevelopmentState("error");
      setDevelopmentError(error instanceof Error ? error.message : "草稿批准失败");
    }
  }

  async function reviseDevelopmentDraft() {
    if (!developmentResult || developmentFeedback.trim().length < 3 || developmentState === "revising") return;
    setDevelopmentState("revising");
    setDevelopmentError("");
    setFeedbackMessage("");
    try {
      const response = await fetch(`/api/development-strategies/${developmentResult.id}/feedback`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ feedback: developmentFeedback.trim(), currentBody: draft,
          sourceRevision: developmentResult.revision, allowMemory: allowFeedbackMemory }),
      });
      const payload = await response.json() as { result?: { draft: DevelopmentStrategyDto; memoryStored: boolean; memorySummary?: string; memoryReason: string }; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || "反馈修改失败");
      setDevelopmentResult(payload.result.draft);
      setDraft(payload.result.draft.draft.body);
      setDevelopmentFeedback("");
      setAllowFeedbackMemory(false);
      setFeedbackMessage(payload.result.memoryStored
        ? `已完成第 ${payload.result.draft.revision} 版；这条反馈已提炼到个人策略记忆：${payload.result.memorySummary}`
        : `已完成第 ${payload.result.draft.revision} 版；该反馈用于本次修改，但未进入长期记忆：${payload.result.memoryReason}`);
      setDevelopmentState("ready");
    } catch (error) {
      setDevelopmentState("error");
      setDevelopmentError(error instanceof Error ? error.message : "反馈修改失败");
    }
  }

  function showLiveResults() {
    setSearchState("complete");
  }

  async function chooseMode(nextMode: Mode) {
    setMode(nextMode);
    setSearchState("idle");
    setSaveState("saving");
    try {
      const response = await fetch("/api/workspaces/current", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: nextMode }) });
      if (!response.ok) throw new Error("保存失败");
      setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1600);
    } catch { setSaveState("error"); }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  const navItems: Array<{ id: View; label: string; meta?: string }> = [
    { id: "home", label: "AI 销售助理" },
    { id: "overview", label: "全球市场概览" },
    { id: "results", label: "销售线索", meta: String(filteredCompanies.length) },
    { id: "map", label: "渠道关系图" },
    { id: "opportunities", label: "机会工作区", meta: String(shortlist.length) },
    { id: "assistant", label: "开发助手" },
    { id: "tasks", label: "任务进程" },
    { id: "knowledge", label: "知识库 & RAG" },
    { id: "mailbox", label: "邮箱学习" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><span className="brand-glyph">N</span><div><strong>Network Copilot</strong><small>Channel Intelligence</small></div></div>
        <div className="workspace-switcher"><span className="market-flag">◎</span><div><strong>Global · All markets</strong><small>AI sales workspace</small></div><Icon name="chevron" size={14} /></div>
        <nav aria-label="主导航">
          <p className="nav-label">Workspace</p>
          {navItems.map((item) => (
            <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => setView(item.id)}>
              <Icon name={item.id} /><span>{item.label}</span>{item.meta && <em>{item.meta}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="snapshot-card">
          <div className="snapshot-title"><span className="live-dot" /> Global intelligence</div>
          <strong>{companies.length} leads · {sourceCount} sources</strong>
          <small>Last run {searchDate} · {initialWorkspace?.latestSearch?.creditsUsed ?? 0} credits</small>
        </div>
        <div className="user-row"><span className="avatar">{userName.slice(0, 2).toUpperCase()}</span><div><strong>{userName}</strong><small>Private workspace</small></div><button aria-label="退出登录" onClick={logout}>退出</button></div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><Icon name="chevron" size={13}/><strong>Global</strong><Icon name="chevron" size={13}/><span>{navItems.find((item) => item.id === view)?.label}</span></div>
          <div className="top-actions"><span className={`snapshot-badge ${saveState === "error" ? "save-error" : ""}`}><span className="live-dot"/>{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到 RDS" : saveState === "error" ? "保存失败，请重试" : `Global workspace · ${searchDate}`}</span><button className="icon-button" aria-label="通知">2</button><button className="avatar small">{userName.slice(0, 2).toUpperCase()}</button></div>
        </header>

        <div className="workspace-content">
          {view !== "home" && <section className="workspace-heading">
            <div>
              <div className="eyebrow">GLOBAL MARKET / ALL CUDY SALES SEGMENTS</div>
              <h1>{view === "overview" ? "全球市场渠道概览" : navItems.find((item) => item.id === view)?.label}</h1>
              <p>{view === "knowledge" ? "统一管理行业、公司和产品知识，以可追溯 RAG 支撑 AI 决策。" : view === "mailbox" ? "只读同步当前用户的邮箱，提取政策、客户信号和开发邮件模板候选。" : view === "tasks" ? "实时查看联系人搜索进度、当前公司、worker 状态和任务产出。" : mode === "new-market" ? "同步建立一级供货能力与下级渠道需求。" : "激活现有供货体系，主动发现未覆盖的下级增长节点。"}</p>
            </div>
            <div className="heading-actions">
              <div className="segmented" aria-label="市场开发模式">
                <button className={mode === "new-market" ? "active" : ""} onClick={() => chooseMode("new-market")}>新市场并行开发</button>
                <button className={mode === "growth" ? "active" : ""} onClick={() => chooseMode("growth")}>已有分销商增长</button>
              </div>
              <button className="primary-button" onClick={() => { setView("results"); showLiveResults(); }}><Icon name="spark" />查看实时线索</button>
            </div>
          </section>}

          {searchState === "complete" && <div className="inline-notice success"><Icon name="check"/><span>当前工作区包含 {companies.length} 个 Tavily 实时候选、{sourceCount} 条来源；角色和适配度在证据复核前均为 Inferred。</span><button onClick={() => setSearchState("idle")} aria-label="关闭"><Icon name="close" size={15}/></button></div>}

          {view === "home" && <AssistantHome userName={userName} onOpenResults={() => setView("results")} />}
          {view === "overview" && <Overview mode={mode} companies={companies} onMode={(next) => { chooseMode(next); setView("results"); }} onSelect={selectCompany} />}
          {view === "results" && <Results companies={filteredCompanies} query={query} setQuery={setQuery} roleFilter={roleFilter} setRoleFilter={setRoleFilter} tierFilter={tierFilter} setTierFilter={setTierFilter} onSelect={selectCompany} onToggle={(company) => updateCompany(company.id, { opportunityStage: company.opportunityStage === "Discovered" ? "Qualified" : "Discovered" })} />}
          {view === "map" && <ChannelMap companies={companies} onSelect={selectCompany} />}
          {view === "opportunities" && <OpportunityWorkspace companies={shortlist} onSelect={selectCompany} onUpdate={updateCompany} />}
          {view === "assistant" && selectedCompany && <DevelopmentAssistant company={selectedCompany} result={developmentResult} draft={draft} setDraft={setDraft} state={developmentState} error={developmentError} feedback={developmentFeedback} setFeedback={setDevelopmentFeedback} feedbackMessage={feedbackMessage} allowMemory={allowFeedbackMemory} setAllowMemory={setAllowFeedbackMemory} onGenerate={() => void generateDevelopment()} onRevise={() => void reviseDevelopmentDraft()} onApprove={() => void approveDevelopmentDraft()} onEvidence={setEvidenceOpen} onChoose={() => setDetailOpen(true)} />}
          {view === "tasks" && <ContactEnrichmentProgress />}
          {view === "knowledge" && <KnowledgeBase />}
          {view === "mailbox" && <MailboxIntegration />}
        </div>
      </main>

      {detailOpen && selectedCompany && <CompanyDrawer company={selectedCompany} contactDetails={initialWorkspace?.contactsByCompanyId[selectedCompany.id]} onClose={() => setDetailOpen(false)} onUpdate={(patch) => updateCompany(selectedCompany.id, patch)} onEvidence={setEvidenceOpen} onOpenAssistant={() => { setDetailOpen(false); setView("assistant"); void generateDevelopment(selectedCompany); }} />}
      {evidenceOpen && <EvidenceModal evidence={evidenceOpen} onClose={() => setEvidenceOpen(null)} />}
    </div>
  );
}

function Overview({ mode, companies, onMode, onSelect }: { mode: Mode; companies: CompanyRecord[]; onMode: (mode: Mode) => void; onSelect: (id: string) => void }) {
  const priority = companies.filter((item) => item.priority === "High").length;
  const ka = companies.filter((item) => item.accountTier === "KA").length;
  const distributors = companies.filter((item) => item.layer === "Tier-1 Distributor").length;
  const downstream = companies.length - distributors;
  const top = [...companies].sort((a, b) => priorityIndex(b) - priorityIndex(a)).slice(0, 5);
  const laneNames = (predicate: (company: CompanyRecord) => boolean) => {
    const names = companies.filter(predicate).slice(0, 3).map((company) => company.displayName);
    return names.length ? names.join(" · ") : "等待从对话中选择国家并搜索";
  };
  return (
    <div className="overview-grid">
      <section className="metrics-row span-12">
        <Metric label="已验证企业" value={String(companies.length)} delta="100% 有身份来源" tone="blue" />
        <Metric label="一级分销节点" value={String(distributors)} delta="供货能力 P0" tone="violet" />
        <Metric label="下级渠道节点" value={String(downstream)} delta="需求节点 P0" tone="mint" />
        <Metric label="KA / 高优先" value={`${ka} / ${priority}`} delta="KA 与角色分离" tone="amber" />
      </section>

      <section className="panel playbook-panel span-8">
        <div className="panel-header"><div><span className="section-kicker">MARKET PLAYBOOK</span><h2>{mode === "new-market" ? "Hybrid 冷启动策略" : "Distributor-led 增长修复"}</h2></div><button className="text-button">编辑策略</button></div>
        <div className="playbook-banner">
          <div className="strategy-icon"><Icon name="spark" size={22}/></div>
          <div><strong>{mode === "new-market" ? "同步构建供货与需求，而非串行等待" : "由品牌主动创造下级需求，再连接现有供货体系"}</strong><p>{mode === "new-market" ? "在目标国家优先验证全国/区域分销节点，同时推进高匹配 E-tailer、SI/MSP 与大型 ISP。" : "以用户确认的现有分销体系为供货锚点，重点开发未覆盖的零售、集成和 ISP 节点。"}</p></div>
        </div>
        <div className="lane-grid">
          <div className="lane"><span className="lane-number">01</span><div><strong>供货基础</strong><p>{laneNames((company) => company.layer === "Tier-1 Distributor")}</p></div><StatusTag tone="violet">Tier-1</StatusTag></div>
          <div className="lane"><span className="lane-number">02</span><div><strong>规模需求</strong><p>{laneNames((company) => company.roles.some((role) => ["Retailer", "E-tailer", "Dealer", "Reseller"].includes(role)))}</p></div><StatusTag tone="blue">Retail</StatusTag></div>
          <div className="lane"><span className="lane-number">03</span><div><strong>项目与服务</strong><p>{laneNames((company) => company.roles.some((role) => ["SI", "MSP", "Installer"].includes(role)))}</p></div><StatusTag tone="green">SI / MSP</StatusTag></div>
          <div className="lane"><span className="lane-number">04</span><div><strong>大型机会</strong><p>{laneNames((company) => company.roles.includes("ISP") || company.accountTier === "KA")}</p></div><StatusTag tone="amber">ISP · KA</StatusTag></div>
        </div>
        <div className="risk-strip"><strong>策略边界</strong><span>大型 ISP 采用 Deep 参与；无公开证据的供货关系只显示为 Hypothesis。</span></div>
      </section>

      <section className="panel scenario-panel span-4">
        <div className="panel-header"><div><span className="section-kicker">CORE SCENARIOS</span><h2>切换工作模式</h2></div></div>
        <button className={`scenario-option ${mode === "new-market" ? "active" : ""}`} onClick={() => onMode("new-market")}><span className="scenario-code">S-01</span><div><strong>新市场并行开发</strong><p>Distributor + 多类下级节点</p></div><Icon name="chevron"/></button>
        <button className={`scenario-option ${mode === "growth" ? "active" : ""}`} onClick={() => onMode("growth")}><span className="scenario-code">S-02</span><div><strong>已有市场增长</strong><p>覆盖空白 + 现有供货关联</p></div><Icon name="chevron"/></button>
        <div className="scenario-foot"><StatusTag tone="amber">P0 变体</StatusTag><span>大型 KA / ISP 深度参与与直供评估</span></div>
      </section>

      <section className="panel span-7">
        <div className="panel-header"><div><span className="section-kicker">PRIORITY QUEUE</span><h2>建议优先研究</h2></div><span className="subtle">Fit ≠ Evidence</span></div>
        <div className="compact-table">
          {top.map((company, index) => <button key={company.id} className="compact-row" onClick={() => onSelect(company.id)}><span className="rank">0{index + 1}</span><span className="company-avatar">{company.displayName.slice(0, 2).toUpperCase()}</span><span className="company-copy"><strong>{company.displayName}</strong><small>{company.roles.join(" · ")} · {company.city}</small></span><StatusTag tone={company.accountTier === "KA" ? "amber" : "blue"}>{company.accountTier}</StatusTag><span className="score-pair"><b>{company.fitScore}</b><small>Fit</small></span><Icon name="chevron" size={15}/></button>)}
        </div>
      </section>

      <section className="panel span-5">
        <div className="panel-header"><div><span className="section-kicker">COVERAGE SIGNAL</span><h2>节点组合健康度</h2></div><strong className="health-score">82</strong></div>
        <div className="coverage-list">
          <CoverageRow label="供货覆盖" value={84} note="11 distributors" tone="violet" />
          <CoverageRow label="零售与转售" value={76} note="10 nodes" tone="blue" />
          <CoverageRow label="项目交付" value={72} note="8 SI / MSP" tone="mint" />
          <CoverageRow label="运营商机会" value={88} note="7 ISP nodes" tone="amber" />
        </div>
        <div className="coverage-note"><Icon name="spark"/><span><strong>AI 建议：</strong> 北部区域 Dealer / Installer 证据仍薄弱，下一轮应补充长尾发现。</span></div>
      </section>
    </div>
  );
}

function Metric({ label, value, delta, tone }: { label: string; value: string; delta: string; tone: string }) {
  return <div className={`metric-card ${tone}`}><div><span>{label}</span><strong>{value}</strong></div><small><i/> {delta}</small></div>;
}

function CoverageRow({ label, value, note, tone }: { label: string; value: number; note: string; tone: "violet" | "blue" | "mint" | "amber" }) {
  return <div className="coverage-row"><div><strong>{label}</strong><small>{note}</small></div><MiniBar value={value} tone={tone === "violet" || tone === "blue" ? "blue" : tone === "amber" ? "amber" : "mint"}/><b>{value}%</b></div>;
}

function Results({ companies, query, setQuery, roleFilter, setRoleFilter, tierFilter, setTierFilter, onSelect, onToggle }: {
  companies: CompanyRecord[]; query: string; setQuery: (value: string) => void; roleFilter: "All" | ChannelRole; setRoleFilter: (value: "All" | ChannelRole) => void; tierFilter: "All" | AccountTier; setTierFilter: (value: "All" | AccountTier) => void; onSelect: (id: string) => void; onToggle: (company: CompanyRecord) => void;
}) {
  const countryGroups = [...companies.reduce((groups, company) => {
    const country = company.country || "未指定国家";
    groups.set(country, [...(groups.get(country) ?? []), company]);
    return groups;
  }, new Map<string, CompanyRecord[]>()).entries()].sort(([a], [b]) => a.localeCompare(b, "zh-CN"));
  return (
    <section className="panel results-panel">
      <div className="results-toolbar">
        <div className="search-field"><Icon name="results" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、城市、域名或角色" aria-label="搜索候选公司"/></div>
        <label className="select-field"><Icon name="filter" size={16}/><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "All" | ChannelRole)}><option value="All">全部角色</option>{roleOptions.map((role) => <option key={role}>{role}</option>)}</select></label>
        <label className="select-field"><select value={tierFilter} onChange={(event) => setTierFilter(event.target.value as "All" | AccountTier)}><option value="All">全部等级</option>{tierOptions.map((tier) => <option key={tier}>{tier}</option>)}</select></label>
        <span className="result-count">{companies.length} 个节点</span>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th aria-label="选择"/><th>公司 / 地域</th><th>渠道身份</th><th>等级</th><th>适配分</th><th>证据置信</th><th>供货建议</th><th>状态</th><th aria-label="操作"/></tr></thead>
          <tbody>{countryGroups.map(([country, countryCompanies]) => <Fragment key={country}>
            <tr className="country-group-row"><td colSpan={9}><strong>{country}</strong><span>{countryCompanies.length} 家公司</span></td></tr>
            {countryCompanies.map((company) => (
            <tr key={company.id} className={company.manuallyEdited ? "manual-row" : ""}>
              <td><input type="checkbox" checked={company.opportunityStage !== "Discovered" && company.opportunityStage !== "Excluded"} onChange={() => onToggle(company)} aria-label={`切换 ${company.displayName} 的 shortlist 状态`}/></td>
              <td><button className="company-cell" onClick={() => onSelect(company.id)}><span className="company-avatar">{company.displayName.slice(0, 2).toUpperCase()}</span><span><strong>{company.displayName}</strong><small>{company.city} · {company.domain}</small></span></button></td>
              <td><span className="layer-label">{company.layer === "Tier-1 Distributor" ? "TIER-1" : "DOWNSTREAM"}</span><div className="role-tags">{company.roles.slice(0, 3).map((role) => <StatusTag key={role} tone={role === "ISP" ? "violet" : "neutral"}>{role}</StatusTag>)}</div></td>
              <td><StatusTag tone={company.accountTier === "KA" ? "amber" : company.accountTier === "Priority" ? "blue" : "neutral"}>{company.accountTier}</StatusTag></td>
              <td><ScoreRing value={company.fitScore} compact/></td>
              <td><div className="confidence-cell"><strong>{company.evidenceConfidence}%</strong><MiniBar value={company.evidenceConfidence}/><small>{company.evidence.length} source{company.evidence.length > 1 ? "s" : ""}</small></div></td>
              <td><span className="supply-copy">{company.supplyModel}</span>{company.manuallyEdited && <small className="manual-badge">Manual</small>}</td>
              <td><span className={`stage-dot ${company.opportunityStage.toLowerCase().replace(" ", "-")}`}/>{company.opportunityStage}</td>
              <td><button className="row-action" onClick={() => onSelect(company.id)} aria-label={`打开 ${company.displayName} 详情`}><Icon name="chevron" size={16}/></button></td>
            </tr>
          ))}</Fragment>)}</tbody>
        </table>
      </div>
      <div className="table-footer"><span>Tavily live search · 按国家分区</span><span>事实与推断分开展示；请在外联前人工复核。</span></div>
    </section>
  );
}

function ChannelMap({ companies, onSelect }: { companies: CompanyRecord[]; onSelect: (id: string) => void }) {
  const distributors = [...companies].filter((item) => item.layer === "Tier-1 Distributor").sort((a, b) => b.fitScore - a.fitScore).slice(0, 5);
  const downstream = [...companies].filter((item) => item.layer === "Downstream Channel" && item.priority === "High").sort((a, b) => b.fitScore - a.fitScore).slice(0, 8);
  const mapCompanies = [...distributors, ...downstream];
  const positions = new Map<string, { x: number; y: number }>();
  distributors.forEach((item, index) => positions.set(item.id, { x: 165, y: 92 + index * 88 }));
  downstream.forEach((item, index) => positions.set(item.id, { x: 725, y: 54 + index * 54 }));
  const lines = liveRelationships.filter((rel) => positions.has(rel.fromNode) && positions.has(rel.toNode));
  const extraLines = distributors.length ? downstream.slice(0, 5).map((item, index) => ({ id: `suggested-${item.id}`, fromNode: distributors[index % distributors.length].id, toNode: item.id, status: "Hypothesis" as const })) : [];
  return (
    <div className="map-layout">
      <section className="panel map-panel">
        <div className="panel-header"><div><span className="section-kicker">RELATIONSHIP CANVAS</span><h2>供货与需求节点连接</h2></div><div className="map-legend"><span><i className="solid-line"/> 已验证</span><span><i className="dash-line"/> AI 假设</span></div></div>
        <svg className="channel-map" viewBox="0 0 900 520" role="img" aria-label="全球渠道关系图">
          <rect x="30" y="18" width="270" height="476" rx="18" className="map-zone distributor-zone"/>
          <rect x="600" y="18" width="270" height="476" rx="18" className="map-zone downstream-zone"/>
          <text x="52" y="48" className="zone-title">SUPPLY NODES · TIER-1</text>
          <text x="622" y="48" className="zone-title">DEMAND NODES · DOWNSTREAM</text>
          {[...lines, ...extraLines].map((rel) => {
            const from = positions.get(rel.fromNode)!; const to = positions.get(rel.toNode)!;
            return <path key={rel.id} d={`M ${from.x + 94} ${from.y} C 390 ${from.y}, 510 ${to.y}, ${to.x - 94} ${to.y}`} className={`map-link ${rel.status === "Hypothesis" ? "hypothesis" : "verified"}`} />;
          })}
          <circle cx="450" cy="260" r="72" className="brand-node"/>
          <text x="450" y="252" textAnchor="middle" className="brand-node-title">CUDY</text><text x="450" y="273" textAnchor="middle" className="brand-node-sub">GLOBAL MARKET</text>
          {mapCompanies.map((company) => {
            const position = positions.get(company.id)!;
            return <g key={company.id} className="map-node" role="button" tabIndex={0} onClick={() => onSelect(company.id)} onKeyDown={(event) => { if (event.key === "Enter") onSelect(company.id); }}>
              <rect x={position.x - 94} y={position.y - 27} width="188" height="54" rx="11"/>
              <circle cx={position.x - 69} cy={position.y} r="16"/><text x={position.x - 69} y={position.y + 4} textAnchor="middle" className="node-initial">{company.displayName.slice(0, 1)}</text>
              <text x={position.x - 44} y={position.y - 3} className="node-name">{company.displayName.length > 18 ? `${company.displayName.slice(0, 17)}…` : company.displayName}</text>
              <text x={position.x - 44} y={position.y + 14} className="node-role">{primaryRole(company)} · {company.accountTier}</text>
              <text x={position.x + 76} y={position.y + 4} textAnchor="end" className="node-score">{company.fitScore}</text>
            </g>;
          })}
        </svg>
        <div className="map-footnote"><Icon name="spark"/><span>图中虚线为基于角色适配生成的供货假设，不代表已验证商业关系。</span></div>
      </section>
      <aside className="panel map-inspector">
        <div className="panel-header"><div><span className="section-kicker">HYPOTHESIS QUEUE</span><h2>待人工确认</h2></div><StatusTag tone="amber">{liveRelationships.filter((item) => item.status === "Hypothesis").length} 条</StatusTag></div>
        <div className="relationship-list">{liveRelationships.map((relationship) => {
          const from = companies.find((item) => item.id === relationship.fromNode); const to = companies.find((item) => item.id === relationship.toNode);
          return <div key={relationship.id} className="relationship-card"><div><StatusTag tone={relationship.status === "Verified" ? "green" : "amber"}>{relationship.status}</StatusTag><small>{relationship.type}</small></div><strong>{from?.displayName} <span>→</span> {to?.displayName}</strong><p>{relationship.status === "Verified" ? "有公开来源支持该组织关联。" : "角色与供货适配推断；尚无直接关系证据。"}</p><div className="relationship-actions"><button>确认</button><button>拒绝</button><button onClick={() => to && onSelect(to.id)}>查看节点</button></div></div>;
        })}{liveRelationships.length === 0 && <p className="subtle">实时线索尚未建立公司间关系；待证据抽取与关系分析后生成。</p>}</div>
      </aside>
    </div>
  );
}

function OpportunityWorkspace({ companies, onSelect, onUpdate }: { companies: CompanyRecord[]; onSelect: (id: string) => void; onUpdate: (id: string, patch: Partial<CompanyRecord>) => void }) {
  const groups: OpportunityStage[] = ["Qualified", "Priority", "Contact Prepared", "Engaged"];
  return <div className="opportunity-board">{groups.map((stage) => { const items = companies.filter((item) => item.opportunityStage === stage); return <section key={stage} className="board-column"><header><div><span className={`stage-dot ${stage.toLowerCase().replace(" ", "-")}`}/><strong>{stage}</strong></div><em>{items.length}</em></header><div className="board-stack">{items.map((company) => <article key={company.id} className="opportunity-card"><button className="card-company" onClick={() => onSelect(company.id)}><span className="company-avatar">{company.displayName.slice(0, 2).toUpperCase()}</span><span><strong>{company.displayName}</strong><small>{company.roles.join(" · ")}</small></span></button><div className="opportunity-meta"><StatusTag tone={company.accountTier === "KA" ? "amber" : "blue"}>{company.accountTier}</StatusTag><span>Fit <b>{company.fitScore}</b></span></div><p>{company.nextAction}</p><div className="card-owner"><span className="avatar tiny">{company.owner === "Unassigned" ? "?" : company.owner.split(" ").map((part) => part[0]).join("")}</span><span>{company.owner}</span><select value={company.opportunityStage} onChange={(event) => onUpdate(company.id, { opportunityStage: event.target.value as OpportunityStage })} aria-label={`修改 ${company.displayName} 状态`}>{stageOptions.map((option) => <option key={option}>{option}</option>)}</select></div></article>)}{items.length === 0 && <div className="empty-column"><Icon name="plus"/><span>暂无节点</span></div>}</div></section>; })}</div>;
}

function DevelopmentAssistant({ company, result, draft, setDraft, state, error, feedback, setFeedback, feedbackMessage,
  allowMemory, setAllowMemory, onGenerate, onRevise, onApprove, onEvidence, onChoose }: {
  company: CompanyRecord; result: DevelopmentStrategyDto | null; draft: string; setDraft: (value: string) => void;
  state: "idle" | "generating" | "ready" | "revising" | "approving" | "approved" | "error"; error: string;
  feedback: string; setFeedback: (value: string) => void; feedbackMessage: string;
  allowMemory: boolean; setAllowMemory: (value: boolean) => void;
  onGenerate: () => void; onRevise: () => void; onApprove: () => void; onEvidence: (evidence: Evidence) => void; onChoose: () => void;
}) {
  const strategy = result?.strategy;
  return <div className="assistant-grid">
    <section className="panel assistant-context"><div className="panel-header"><div><span className="section-kicker">SELECTED NODE</span><h2>开发上下文</h2></div><button className="text-button" onClick={onChoose}>切换节点</button></div><div className="selected-company"><span className="company-avatar large">{company.displayName.slice(0, 2).toUpperCase()}</span><div><h3>{company.displayName}</h3><p>{company.roles.join(" · ")} · {company.city}</p></div><ScoreRing value={company.fitScore}/></div><div className="context-grid"><div><span>Account Tier</span><strong>{company.accountTier}</strong></div><div><span>Supply Model</span><strong>{company.supplyModel}</strong></div><div><span>Brand Involvement</span><strong>{company.brandInvolvement}</strong></div><div><span>Evidence Confidence</span><strong>{company.evidenceConfidence}%</strong></div></div><div className="assistant-section"><span className="section-kicker">EVIDENCE USED</span>{company.evidence.map((item) => <button className="evidence-mini" key={item.id} onClick={() => onEvidence(item)}><span>{item.id}</span><div><strong>{item.title}</strong><small>{item.summary}</small></div><Icon name="external" size={14}/></button>)}</div></section>
    <section className="panel plan-panel"><div className="panel-header"><div><span className="section-kicker">DEVELOPMENT STRATEGY AGENT</span><h2>Kimi 初稿 · Claude 修订</h2></div><StatusTag tone={result?.model.endsWith("fallback") ? "amber" : "violet"}><Icon name="spark" size={13}/>{result ? result.model : "Awaiting generation"}</StatusTag></div>
      {!strategy ? <div className="plan-highlight"><span>{state === "generating" ? "正在编排" : "尚未生成"}</span><strong>{state === "generating" ? "正在读取候选证据、开发策略专库和已批准邮箱风格…" : "点击生成，由 Kimi-k3 制定策略并写开发信。"}</strong><button className="primary-button" disabled={state === "generating"} onClick={onGenerate}>{state === "generating" ? "生成中…" : "生成开发策略"}</button></div> : <><div className="plan-highlight"><span>推荐切入</span><strong>{strategy.personalizationAngle}</strong></div><div className="plan-columns"><div><span className="section-kicker">PRODUCT WEDGE</span><ul className="product-list">{strategy.recommendedProducts.map((product) => <li key={product}><Icon name="check" size={15}/>{product}</li>)}</ul></div><div><span className="section-kicker">TARGET ROLES</span><ul className="title-list">{strategy.targetTitles.map((title) => <li key={title}>{title}</li>)}</ul></div></div><div className="assistant-section"><span className="section-kicker">FOLLOW-UP PLAN</span><ol className="step-list">{strategy.followUpPlan.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol></div></>}
      {error && <div className="safety-banner"><span>{error}</span></div>}
      {result?.warnings.map((warning) => <div className="safety-banner" key={warning}><span>{warning}</span></div>)}
    </section>
    <section className="panel draft-panel"><div className="panel-header"><div><span className="section-kicker">OUTREACH DRAFT · REVIEW REQUIRED</span><h2>{result?.draft.language === "en" ? "英文触达草稿" : "定制触达草稿"}</h2></div><div className="draft-actions"><button className="secondary-button" disabled={state === "generating" || state === "revising"} onClick={onGenerate}>{state === "generating" ? "生成中…" : "重新生成"}</button><button className="secondary-button" disabled={!result || state === "approving" || state === "approved" || state === "revising"} onClick={onApprove}>{state === "approved" ? "已批准" : state === "approving" ? "保存中…" : "确认并批准"}</button><button className="primary-button" disabled={!draft} onClick={() => navigator.clipboard?.writeText(draft)}><Icon name="check"/>复制草稿</button></div></div><div className="safety-banner"><Icon name="spark"/><span>每一版都必须人工审核确认。事实引用已在服务端校验；批准不会触发邮件发送。</span></div>{result?.draft.subjectOptions.length ? <div className="assistant-section"><span className="section-kicker">SUBJECT OPTIONS</span><ul className="title-list">{result.draft.subjectOptions.map((subject) => <li key={subject}>{subject}</li>)}</ul></div> : null}<textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={state === "generating" ? "Kimi 正在生成…" : "生成后可在此人工编辑"} aria-label="开发信草稿"/>{result ? <div className="assistant-section"><span className="section-kicker">FEEDBACK & REVISION</span><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="例如：增加荷兰 MediaMarkt 的品牌背书；语气更像我之前的长邮件；CTA 不要太强。" aria-label="开发信优化反馈"/><label className="memory-consent"><input type="checkbox" checked={allowMemory} onChange={(event) => setAllowMemory(event.target.checked)}/><span><strong>允许写入个人长期记忆</strong><small>仅当 Agent 判断为可跨公司复用的市场、渠道或稳定风格经验时写入；联系人、单家公司措辞和未证实事实不会记忆。</small></span></label><button className="secondary-button" disabled={feedback.trim().length < 3 || state === "revising"} onClick={onRevise}>{state === "revising" ? "正在修改并筛选记忆…" : "提交人工评价并生成新版本"}</button>{feedbackMessage && <div className="safety-banner"><span>{feedbackMessage}</span></div>}</div> : null}<div className="draft-foot"><span>{result ? `Revision ${result.revision} · ${result.draft.wordCount} words` : `${draft.length} characters`}</span><span>{result?.evidenceIds.length ?? 0} company evidence · {result?.knowledgeIds.length ?? 0} strategy KB references</span><span>{result ? `${result.generationMetrics.modelCalls} model call · ${(result.generationMetrics.latencyMs / 1000).toFixed(1)}s · ${result.generationMetrics.totalTokens ?? "n/a"} tokens` : "Single-call Kimi v2"}</span><span>{result?.promptVersion ?? "Kimi Agent v2"}</span></div></section>
  </div>;
}

function ContactPanel({ details }: { details?: CompanyContactDetailsDto }) {
  if (!details) return <section className="drawer-section contact-section"><div className="section-line"><span className="section-kicker">CONTACT INTELLIGENCE</span><StatusTag tone="neutral">Not enriched</StatusTag></div><div className="contact-empty"><Icon name="results" size={20}/><strong>尚未搜索联系人</strong><p>该公司不在当前 10 家验证批次中。运行联系人 enrichment 后，这里会显示公开姓名、职位、邮箱状态和来源。</p></div></section>;

  const publicEmails = details.emails.filter((email) => email.status === "Public").length;
  const verifiedEmails = details.emails.filter((email) => email.status === "Verified").length;
  const guessedEmails = details.emails.filter((email) => email.status === "Pattern-guessed").length;
  const reviewEmails = details.emails.filter((email) => email.verification?.category === "NeedsReview").length;
  return <section className="drawer-section contact-section">
    <div className="section-line"><div><span className="section-kicker">CONTACT INTELLIGENCE</span><small className="contact-meta">更新于 {details.enrichedAt.slice(0, 10)} · {details.evidenceCount} 条网页证据</small></div><StatusTag tone={details.contacts.length || details.emails.length ? "green" : "amber"}>{details.contacts.length || details.emails.length ? "Enriched" : "No match"}</StatusTag></div>
    <div className="contact-stats" aria-label="联系人数据摘要"><div><strong>{details.contacts.length}</strong><span>公开姓名</span></div><div><strong>{publicEmails}</strong><span>公开邮箱</span></div><div><strong>{verifiedEmails}</strong><span>Agent 已验证</span></div><div><strong>{reviewEmails || guessedEmails}</strong><span>{reviewEmails ? "Agent 待审核" : "猜测邮箱"}</span></div></div>
    <div className="contact-provider-row"><span>数据源</span>{details.providerMix.map((provider) => <StatusTag key={provider} tone={provider === "snov" ? "violet" : "neutral"}>{providerLabel(provider)}</StatusTag>)}</div>
    {details.contacts.length > 0 && <div className="contact-group"><h3>公开联系人</h3>{details.contacts.map((contact) => <article className="contact-card" key={contact.id}><span className="contact-avatar">{contact.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><div><div className="contact-name-line"><strong>{contact.fullName}</strong><StatusTag tone={contactStatusTone(contact.status)}>{contact.status}</StatusTag></div><p>{contact.jobTitle || "职位尚待确认"}</p><small>{providerLabel(contact.sourceProvider)} · confidence {contact.confidence}%</small></div><a href={contact.publicProfileUrl || contact.sourceUrl} target="_blank" rel="noreferrer" aria-label={`打开 ${contact.fullName} 的公开来源`}><Icon name="external" size={15}/></a></article>)}</div>}
    {details.emails.length > 0 && <div className="contact-group"><h3>邮箱候选</h3>{details.emails.map((email) => <article className={`email-card ${email.status === "Pattern-guessed" ? "guessed" : ""} ${email.verification?.category === "NeedsReview" ? "agent-review" : ""}`} key={email.id}><div className="email-main"><code>{email.email}</code><div><StatusTag tone={emailStatusTone(email.status)}>{email.status}</StatusTag><span>{email.confidence}%</span></div></div>{email.verification && <div className="contact-agent-decision"><div><span>Verification Agent</span><StatusTag tone={email.verification.category === "NeedsReview" ? "amber" : "green"}>{email.verification.category}</StatusTag></div><dl><div><dt>准确度</dt><dd>{email.verification.confidenceScore}</dd></div><div><dt>角色相关</dt><dd>{email.verification.roleRelevanceScore}</dd></div><div><dt>可触达</dt><dd>{email.verification.reachabilityScore}</dd></div><div><dt>开发优先</dt><dd>{email.verification.developmentPriority}</dd></div></dl>{email.verification.reasons[0] && <p>{email.verification.reasons[0]}</p>}</div>}<div className="email-actions"><span>{providerLabel(email.sourceProvider)}</span><button onClick={() => navigator.clipboard?.writeText(email.email)} aria-label={`复制 ${email.email}`}>复制</button>{email.sourceUrl && <a href={email.sourceUrl} target="_blank" rel="noreferrer">来源 <Icon name="external" size={12}/></a>}</div>{email.derivation && <p>{email.derivation}</p>}</article>)}</div>}
    {details.contacts.length === 0 && details.emails.length === 0 && <div className="contact-empty compact"><strong>本轮未找到可靠联系人</strong><p>已保留 {details.evidenceCount} 条搜索证据；不会为了填满字段而生成姓名或邮箱。</p></div>}
    <div className="contact-safety"><Icon name="spark" size={14}/><span>`Pattern-guessed` 不是公开或已验证邮箱，必须人工复核；系统不会自动发送邮件。</span></div>
  </section>;
}

function CompanyDrawer({ company, contactDetails, onClose, onUpdate, onEvidence, onOpenAssistant }: { company: CompanyRecord; contactDetails?: CompanyContactDetailsDto; onClose: () => void; onUpdate: (patch: Partial<CompanyRecord>) => void; onEvidence: (evidence: Evidence) => void; onOpenAssistant: () => void }) {
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="company-drawer" aria-label={`${company.displayName} 公司详情`}>
    <header className="drawer-header"><div className="drawer-title"><span className="company-avatar large">{company.displayName.slice(0, 2).toUpperCase()}</span><div><span className="layer-label">{company.layer}</span><h2>{company.displayName}</h2><a href={`https://${company.domain}`} target="_blank" rel="noreferrer">{company.domain} <Icon name="external" size={13}/></a></div></div><button className="close-button" onClick={onClose} aria-label="关闭详情"><Icon name="close"/></button></header>
    <div className="drawer-body"><div className="drawer-score-row"><ScoreRing value={company.fitScore}/><div><span>Opportunity Fit</span><strong>{company.fitScore} / 100</strong><small>Evidence confidence {company.evidenceConfidence}%</small></div><StatusTag tone={company.accountTier === "KA" ? "amber" : "blue"}>{company.accountTier}</StatusTag></div><p className="company-summary">{company.summary}</p>
      <section className="drawer-section"><div className="section-line"><span className="section-kicker">CHANNEL CLASSIFICATION</span>{company.manuallyEdited && <StatusTag tone="blue">Manual override</StatusTag>}</div><div className="role-tags large-tags">{company.roles.map((role) => <StatusTag key={role} tone={role === "ISP" ? "violet" : "neutral"}>{role}</StatusTag>)}</div><div className="edit-grid"><label>Account Tier<select value={company.accountTier} onChange={(event) => onUpdate({ accountTier: event.target.value as AccountTier })}>{tierOptions.map((tier) => <option key={tier}>{tier}</option>)}</select></label><label>Supply Model<select value={company.supplyModel} onChange={(event) => onUpdate({ supplyModel: event.target.value as SupplyModel })}>{supplyOptions.map((supply) => <option key={supply}>{supply}</option>)}</select></label><label>Opportunity Stage<select value={company.opportunityStage} onChange={(event) => onUpdate({ opportunityStage: event.target.value as OpportunityStage })}>{stageOptions.map((stage) => <option key={stage}>{stage}</option>)}</select></label><label>Brand Involvement<select value={company.brandInvolvement} onChange={(event) => onUpdate({ brandInvolvement: event.target.value as CompanyRecord["brandInvolvement"] })}>{["Light", "Standard", "Deep"].map((value) => <option key={value}>{value}</option>)}</select></label></div></section>
      <section className="drawer-section"><span className="section-kicker">ROLE-SPECIFIC ASSESSMENT</span><div className="assessment-grid"><div><span>Fit score</span><MiniBar value={company.fitScore}/><b>{company.fitScore}</b></div><div><span>Account value</span><MiniBar value={company.accountValue} tone="blue"/><b>{company.accountValue}</b></div><div><span>Reachability</span><MiniBar value={company.reachability} tone="amber"/><b>{company.reachability}</b></div><div><span>Evidence</span><MiniBar value={company.evidenceConfidence}/><b>{company.evidenceConfidence}</b></div></div></section>
      <ContactPanel details={contactDetails}/>
      <section className="drawer-section"><span className="section-kicker">EVIDENCE · FACTS</span><div className="evidence-stack">{company.evidence.map((item) => <button key={item.id} className="evidence-card" onClick={() => onEvidence(item)}><div><StatusTag tone={item.status === "Verified" || item.status === "Corroborated" ? "green" : "amber"}>{item.status}</StatusTag><span>{item.id}</span></div><strong>{item.claim}</strong><small>{item.title} · captured {item.capturedAt}</small></button>)}</div></section>
      <section className="drawer-section"><span className="section-kicker">RISKS & UNKNOWNS</span><ul className="risk-list">{company.risks.map((risk) => <li key={risk}><span>Risk</span>{risk}</li>)}{company.unknowns.map((unknown) => <li key={unknown}><span className="unknown">Unknown</span>{unknown}</li>)}</ul></section>
    </div><footer className="drawer-footer"><button className="secondary-button" onClick={onClose}>关闭</button><button className="primary-button" onClick={onOpenAssistant}><Icon name="spark"/>生成开发计划</button></footer>
  </aside></div>;
}

function EvidenceModal({ evidence, onClose }: { evidence: Evidence; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="evidence-modal" role="dialog" aria-modal="true" aria-label="证据详情"><header><div><span className="section-kicker">EVIDENCE RECORD</span><h2>{evidence.id}</h2></div><button className="close-button" onClick={onClose} aria-label="关闭证据"><Icon name="close"/></button></header><div className="evidence-metadata"><div><span>Status</span><StatusTag tone={evidence.status === "Verified" || evidence.status === "Corroborated" ? "green" : "amber"}>{evidence.status}</StatusTag></div><div><span>Confidence</span><strong>{evidence.confidence}%</strong></div><div><span>Source type</span><strong>{evidence.sourceType}</strong></div><div><span>Captured</span><strong>{evidence.capturedAt}</strong></div></div><div className="claim-box"><span>SUPPORTED CLAIM</span><p>{evidence.claim}</p></div><div className="summary-box"><span>PUBLIC SOURCE SUMMARY</span><p>{evidence.summary}</p></div><a className="source-link" href={evidence.sourceUrl} target="_blank" rel="noreferrer"><Icon name="external"/>打开公开来源<span>{evidence.title}</span></a><p className="evidence-disclaimer">来源来自 Tavily 实时搜索；在商业决策、角色确认或外联前应再次核验官网身份与页面新鲜度。</p></section></div>;
}
