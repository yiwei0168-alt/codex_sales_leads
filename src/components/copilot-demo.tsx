"use client";

import { useMemo, useState } from "react";
import { mexicoCompanies, mexicoRelationships, snapshotMeta } from "@/data/mexico-snapshot";
import { KnowledgeBase } from "@/components/knowledge-base";
import {
  buildDevelopmentPlan,
  primaryRole,
  priorityIndex,
  type AccountTier,
  type ChannelRole,
  type CompanyRecord,
  type Evidence,
  type OpportunityStage,
  type SupplyModel,
} from "@/lib/domain";

type View = "overview" | "results" | "map" | "opportunities" | "assistant" | "knowledge";
type Mode = "new-market" | "growth";
type SearchState = "idle" | "retrieving" | "complete";

const roleOptions: ChannelRole[] = [
  "Distributor", "VAD", "VAR", "Dealer", "Reseller", "Retailer", "E-tailer", "SI", "Installer", "MSP", "ISP",
];
const supplyOptions: SupplyModel[] = ["Distributor Supply", "Brand Direct", "Co-sell/Co-supply", "TBD"];
const tierOptions: AccountTier[] = ["KA", "Priority", "Standard", "Long-tail"];
const stageOptions: OpportunityStage[] = ["Discovered", "Qualified", "Priority", "Contact Prepared", "Engaged", "Excluded"];

const icons: Record<string, React.ReactNode> = {
  overview: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></>,
  results: <><path d="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" /></>,
  map: <><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="m7 7 4 9m6-9-4 9M7 6h10"/></>,
  opportunities: <><path d="M4 7h16v13H4zM8 7V4h8v3M4 12h16M10 12v2h4v-2" /></>,
  assistant: <><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="4"/></>,
  knowledge: <><path d="M4 5c3-1.4 5.7-1.2 8 .6V20c-2.3-1.8-5-2-8-.6V5Zm16 0c-3-1.4-5.7-1.2-8 .6V20c2.3-1.8 5-2 8-.6V5Z"/><path d="M8 9h1m-1 3h1m6-3h1m-1 3h1"/></>,
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

export function CopilotDemo() {
  const [view, setView] = useState<View>("overview");
  const [mode, setMode] = useState<Mode>("new-market");
  const [companies, setCompanies] = useState<CompanyRecord[]>(mexicoCompanies);
  const [selectedId, setSelectedId] = useState("syscom");
  const [detailOpen, setDetailOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState<Evidence | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"All" | ChannelRole>("All");
  const [tierFilter, setTierFilter] = useState<"All" | AccountTier>("All");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [draft, setDraft] = useState("");

  const selectedCompany = companies.find((item) => item.id === selectedId) ?? companies[0];
  const selectedPlan = useMemo(() => buildDevelopmentPlan(selectedCompany), [selectedCompany]);
  const shortlist = companies.filter((company) => !["Discovered", "Excluded"].includes(company.opportunityStage));

  const filteredCompanies = useMemo(() => {
    const term = query.trim().toLowerCase();
    return companies
      .filter((company) => mode === "new-market" || company.layer === "Downstream Channel" || company.id === "exel")
      .filter((company) => roleFilter === "All" || company.roles.includes(roleFilter))
      .filter((company) => tierFilter === "All" || company.accountTier === tierFilter)
      .filter((company) => !term || [company.displayName, company.city, company.domain, company.roles.join(" ")].join(" ").toLowerCase().includes(term))
      .sort((a, b) => priorityIndex(b) - priorityIndex(a));
  }, [companies, mode, query, roleFilter, tierFilter]);

  function updateCompany(id: string, patch: Partial<CompanyRecord>) {
    setCompanies((items) => items.map((item) => item.id === id ? { ...item, ...patch, manuallyEdited: true } : item));
  }

  function selectCompany(id: string, openDrawer = true) {
    setSelectedId(id);
    setDraft("");
    if (openDrawer) setDetailOpen(true);
  }

  function replaySnapshot() {
    if (searchState === "retrieving") return;
    setSearchState("retrieving");
    window.setTimeout(() => setSearchState("complete"), 900);
  }

  function chooseMode(nextMode: Mode) {
    setMode(nextMode);
    setSearchState("idle");
  }

  const navItems: Array<{ id: View; label: string; meta?: string }> = [
    { id: "overview", label: "市场工作台" },
    { id: "results", label: "节点发现", meta: String(filteredCompanies.length) },
    { id: "map", label: "渠道关系图" },
    { id: "opportunities", label: "机会工作区", meta: String(shortlist.length) },
    { id: "assistant", label: "开发助手" },
    { id: "knowledge", label: "知识库 & RAG" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><span className="brand-glyph">N</span><div><strong>Network Copilot</strong><small>Channel Intelligence</small></div></div>
        <div className="workspace-switcher"><span className="market-flag">MX</span><div><strong>Mexico · SMB</strong><small>Active workspace</small></div><Icon name="chevron" size={14} /></div>
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
          <div className="snapshot-title"><span className="live-dot" /> Public snapshot</div>
          <strong>{snapshotMeta.companyCount} companies · {snapshotMeta.sourceCount} sources</strong>
          <small>Captured {snapshotMeta.capturedAt}</small>
        </div>
        <div className="user-row"><span className="avatar">MC</span><div><strong>María Chen</strong><small>Regional Sales Lead</small></div><button aria-label="打开用户菜单">•••</button></div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs"><span>Markets</span><Icon name="chevron" size={13}/><strong>Mexico</strong><Icon name="chevron" size={13}/><span>{navItems.find((item) => item.id === view)?.label}</span></div>
          <div className="top-actions"><span className="snapshot-badge"><span className="live-dot"/> Public data · {snapshotMeta.capturedAt}</span><button className="icon-button" aria-label="通知">2</button><button className="avatar small">MC</button></div>
        </header>

        <div className="workspace-content">
          <section className="workspace-heading">
            <div>
              <div className="eyebrow">MEXICO MARKET / SMB NETWORKING</div>
              <h1>{view === "overview" ? "市场渠道工作台" : navItems.find((item) => item.id === view)?.label}</h1>
              <p>{view === "knowledge" ? "统一管理行业、公司和产品知识，以可追溯 RAG 支撑 AI 决策。" : mode === "new-market" ? "同步建立一级供货能力与下级渠道需求。" : "激活现有供货体系，主动发现未覆盖的下级增长节点。"}</p>
            </div>
            <div className="heading-actions">
              <div className="segmented" aria-label="市场开发模式">
                <button className={mode === "new-market" ? "active" : ""} onClick={() => chooseMode("new-market")}>新市场并行开发</button>
                <button className={mode === "growth" ? "active" : ""} onClick={() => chooseMode("growth")}>已有分销商增长</button>
              </div>
              <button className="primary-button" onClick={() => { setView("results"); replaySnapshot(); }}><Icon name="spark" />{searchState === "retrieving" ? "载入快照…" : "运行节点检索"}</button>
            </div>
          </section>

          {searchState === "retrieving" && <div className="pipeline-progress"><span/><div><strong>正在重放稳定数据快照</strong><small>实体归一 → 角色分类 → 规则评分 → 关系假设</small></div><em>72%</em></div>}
          {searchState === "complete" && <div className="inline-notice success"><Icon name="check"/><span>快照已载入：{snapshotMeta.companyCount} 家真实企业，{snapshotMeta.sourceCount} 条公开来源。未执行实时全网搜索。</span><button onClick={() => setSearchState("idle")} aria-label="关闭"><Icon name="close" size={15}/></button></div>}

          {view === "overview" && <Overview mode={mode} companies={companies} onMode={(next) => { chooseMode(next); setView("results"); }} onSelect={selectCompany} />}
          {view === "results" && <Results companies={filteredCompanies} query={query} setQuery={setQuery} roleFilter={roleFilter} setRoleFilter={setRoleFilter} tierFilter={tierFilter} setTierFilter={setTierFilter} onSelect={selectCompany} onToggle={(company) => updateCompany(company.id, { opportunityStage: company.opportunityStage === "Discovered" ? "Qualified" : "Discovered" })} />}
          {view === "map" && <ChannelMap companies={companies} onSelect={selectCompany} />}
          {view === "opportunities" && <OpportunityWorkspace companies={shortlist} onSelect={selectCompany} onUpdate={updateCompany} />}
          {view === "assistant" && <DevelopmentAssistant company={selectedCompany} plan={selectedPlan} draft={draft || selectedPlan.draft} setDraft={setDraft} onEvidence={setEvidenceOpen} onChoose={() => setDetailOpen(true)} />}
          {view === "knowledge" && <KnowledgeBase />}
        </div>
      </main>

      {detailOpen && <CompanyDrawer company={selectedCompany} onClose={() => setDetailOpen(false)} onUpdate={(patch) => updateCompany(selectedCompany.id, patch)} onEvidence={setEvidenceOpen} onOpenAssistant={() => { setDetailOpen(false); setView("assistant"); }} />}
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
          <div><strong>{mode === "new-market" ? "同步构建供货与需求，而非串行等待" : "由品牌主动创造下级需求，再连接现有供货体系"}</strong><p>{mode === "new-market" ? "优先验证 3–4 个全国/区域分销节点，同时推进高匹配 E-tailer、SI/MSP 与大型 ISP。" : "固定 Exel del Norte 为现有供货锚点，重点开发未覆盖的零售、集成和 ISP 节点。"}</p></div>
        </div>
        <div className="lane-grid">
          <div className="lane"><span className="lane-number">01</span><div><strong>供货基础</strong><p>{mode === "new-market" ? "SYSCOM · Grupo CVA · Exel" : "Exel del Norte（现有）"}</p></div><StatusTag tone="violet">Tier-1</StatusTag></div>
          <div className="lane"><span className="lane-number">02</span><div><strong>规模需求</strong><p>Cyberpuerta · Intercompras · Office Depot</p></div><StatusTag tone="blue">Retail</StatusTag></div>
          <div className="lane"><span className="lane-number">03</span><div><strong>项目与服务</strong><p>Ikusi · Alestra · KIO Networks</p></div><StatusTag tone="green">SI / MSP</StatusTag></div>
          <div className="lane"><span className="lane-number">04</span><div><strong>大型机会</strong><p>TELMEX · Totalplay · izzi</p></div><StatusTag tone="amber">ISP · KA</StatusTag></div>
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
          <tbody>{companies.map((company) => (
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
          ))}</tbody>
        </table>
      </div>
      <div className="table-footer"><span>Public Data Snapshot · {snapshotMeta.capturedAt}</span><span>事实与推断分开展示；请在外联前人工复核。</span></div>
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
  const lines = mexicoRelationships.filter((rel) => positions.has(rel.fromNode) && positions.has(rel.toNode));
  const extraLines = downstream.slice(0, 5).map((item, index) => ({ id: `suggested-${item.id}`, fromNode: distributors[index % distributors.length].id, toNode: item.id, status: "Hypothesis" as const }));
  return (
    <div className="map-layout">
      <section className="panel map-panel">
        <div className="panel-header"><div><span className="section-kicker">RELATIONSHIP CANVAS</span><h2>供货与需求节点连接</h2></div><div className="map-legend"><span><i className="solid-line"/> 已验证</span><span><i className="dash-line"/> AI 假设</span></div></div>
        <svg className="channel-map" viewBox="0 0 900 520" role="img" aria-label="墨西哥渠道关系图">
          <rect x="30" y="18" width="270" height="476" rx="18" className="map-zone distributor-zone"/>
          <rect x="600" y="18" width="270" height="476" rx="18" className="map-zone downstream-zone"/>
          <text x="52" y="48" className="zone-title">SUPPLY NODES · TIER-1</text>
          <text x="622" y="48" className="zone-title">DEMAND NODES · DOWNSTREAM</text>
          {[...lines, ...extraLines].map((rel) => {
            const from = positions.get(rel.fromNode)!; const to = positions.get(rel.toNode)!;
            return <path key={rel.id} d={`M ${from.x + 94} ${from.y} C 390 ${from.y}, 510 ${to.y}, ${to.x - 94} ${to.y}`} className={`map-link ${rel.status === "Hypothesis" ? "hypothesis" : "verified"}`} />;
          })}
          <circle cx="450" cy="260" r="72" className="brand-node"/>
          <text x="450" y="252" textAnchor="middle" className="brand-node-title">NORTHSTAR</text><text x="450" y="273" textAnchor="middle" className="brand-node-sub">SMB NETWORKING</text>
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
        <div className="panel-header"><div><span className="section-kicker">HYPOTHESIS QUEUE</span><h2>待人工确认</h2></div><StatusTag tone="amber">{mexicoRelationships.filter((item) => item.status === "Hypothesis").length} 条</StatusTag></div>
        <div className="relationship-list">{mexicoRelationships.map((relationship) => {
          const from = companies.find((item) => item.id === relationship.fromNode); const to = companies.find((item) => item.id === relationship.toNode);
          return <div key={relationship.id} className="relationship-card"><div><StatusTag tone={relationship.status === "Verified" ? "green" : "amber"}>{relationship.status}</StatusTag><small>{relationship.type}</small></div><strong>{from?.displayName} <span>→</span> {to?.displayName}</strong><p>{relationship.status === "Verified" ? "有公开来源支持该组织关联。" : "角色与供货适配推断；尚无直接关系证据。"}</p><div className="relationship-actions"><button>确认</button><button>拒绝</button><button onClick={() => to && onSelect(to.id)}>查看节点</button></div></div>;
        })}</div>
      </aside>
    </div>
  );
}

function OpportunityWorkspace({ companies, onSelect, onUpdate }: { companies: CompanyRecord[]; onSelect: (id: string) => void; onUpdate: (id: string, patch: Partial<CompanyRecord>) => void }) {
  const groups: OpportunityStage[] = ["Qualified", "Priority", "Contact Prepared", "Engaged"];
  return <div className="opportunity-board">{groups.map((stage) => { const items = companies.filter((item) => item.opportunityStage === stage); return <section key={stage} className="board-column"><header><div><span className={`stage-dot ${stage.toLowerCase().replace(" ", "-")}`}/><strong>{stage}</strong></div><em>{items.length}</em></header><div className="board-stack">{items.map((company) => <article key={company.id} className="opportunity-card"><button className="card-company" onClick={() => onSelect(company.id)}><span className="company-avatar">{company.displayName.slice(0, 2).toUpperCase()}</span><span><strong>{company.displayName}</strong><small>{company.roles.join(" · ")}</small></span></button><div className="opportunity-meta"><StatusTag tone={company.accountTier === "KA" ? "amber" : "blue"}>{company.accountTier}</StatusTag><span>Fit <b>{company.fitScore}</b></span></div><p>{company.nextAction}</p><div className="card-owner"><span className="avatar tiny">{company.owner === "Unassigned" ? "?" : company.owner.split(" ").map((part) => part[0]).join("")}</span><span>{company.owner}</span><select value={company.opportunityStage} onChange={(event) => onUpdate(company.id, { opportunityStage: event.target.value as OpportunityStage })} aria-label={`修改 ${company.displayName} 状态`}>{stageOptions.map((option) => <option key={option}>{option}</option>)}</select></div></article>)}{items.length === 0 && <div className="empty-column"><Icon name="plus"/><span>暂无节点</span></div>}</div></section>; })}</div>;
}

function DevelopmentAssistant({ company, plan, draft, setDraft, onEvidence, onChoose }: { company: CompanyRecord; plan: ReturnType<typeof buildDevelopmentPlan>; draft: string; setDraft: (value: string) => void; onEvidence: (evidence: Evidence) => void; onChoose: () => void }) {
  return <div className="assistant-grid">
    <section className="panel assistant-context"><div className="panel-header"><div><span className="section-kicker">SELECTED NODE</span><h2>开发上下文</h2></div><button className="text-button" onClick={onChoose}>切换节点</button></div><div className="selected-company"><span className="company-avatar large">{company.displayName.slice(0, 2).toUpperCase()}</span><div><h3>{company.displayName}</h3><p>{company.roles.join(" · ")} · {company.city}</p></div><ScoreRing value={company.fitScore}/></div><div className="context-grid"><div><span>Account Tier</span><strong>{company.accountTier}</strong></div><div><span>Supply Model</span><strong>{company.supplyModel}</strong></div><div><span>Brand Involvement</span><strong>{company.brandInvolvement}</strong></div><div><span>Evidence Confidence</span><strong>{company.evidenceConfidence}%</strong></div></div><div className="assistant-section"><span className="section-kicker">EVIDENCE USED</span>{company.evidence.map((item) => <button className="evidence-mini" key={item.id} onClick={() => onEvidence(item)}><span>{item.id}</span><div><strong>{item.title}</strong><small>{item.summary}</small></div><Icon name="external" size={14}/></button>)}</div></section>
    <section className="panel plan-panel"><div className="panel-header"><div><span className="section-kicker">DEVELOPMENT PLAN</span><h2>节点差异化开发计划</h2></div><StatusTag tone="violet"><Icon name="spark" size={13}/> Evidence-linked</StatusTag></div><div className="plan-highlight"><span>推荐切入</span><strong>{plan.angle}</strong></div><div className="plan-columns"><div><span className="section-kicker">PRODUCT WEDGE</span><ul className="product-list">{plan.products.map((product) => <li key={product}><Icon name="check" size={15}/>{product}</li>)}</ul></div><div><span className="section-kicker">TARGET ROLES</span><ul className="title-list">{plan.targetTitles.map((title) => <li key={title}>{title}</li>)}</ul></div></div><div className="assistant-section"><span className="section-kicker">HUMAN NEXT STEPS</span><ol className="step-list">{plan.steps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol></div></section>
    <section className="panel draft-panel"><div className="panel-header"><div><span className="section-kicker">OUTREACH DRAFT · NOT SENT</span><h2>英文触达草稿</h2></div><div className="draft-actions"><button className="secondary-button" onClick={() => setDraft(plan.draft)}>重新生成</button><button className="primary-button" onClick={() => navigator.clipboard?.writeText(draft)}><Icon name="check"/>复制草稿</button></div></div><div className="safety-banner"><Icon name="spark"/><span>个性化事实已附 Evidence ID。系统不会发送邮件；请人工复核后使用。</span></div><textarea value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="英文触达草稿"/><div className="draft-foot"><span>{draft.length} characters</span><span>{plan.evidenceIds.length} evidence references</span><span>Prompt v0.3-demo · Rules v1</span></div></section>
  </div>;
}

function CompanyDrawer({ company, onClose, onUpdate, onEvidence, onOpenAssistant }: { company: CompanyRecord; onClose: () => void; onUpdate: (patch: Partial<CompanyRecord>) => void; onEvidence: (evidence: Evidence) => void; onOpenAssistant: () => void }) {
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="company-drawer" aria-label={`${company.displayName} 公司详情`}>
    <header className="drawer-header"><div className="drawer-title"><span className="company-avatar large">{company.displayName.slice(0, 2).toUpperCase()}</span><div><span className="layer-label">{company.layer}</span><h2>{company.displayName}</h2><a href={`https://${company.domain}`} target="_blank" rel="noreferrer">{company.domain} <Icon name="external" size={13}/></a></div></div><button className="close-button" onClick={onClose} aria-label="关闭详情"><Icon name="close"/></button></header>
    <div className="drawer-body"><div className="drawer-score-row"><ScoreRing value={company.fitScore}/><div><span>Opportunity Fit</span><strong>{company.fitScore} / 100</strong><small>Evidence confidence {company.evidenceConfidence}%</small></div><StatusTag tone={company.accountTier === "KA" ? "amber" : "blue"}>{company.accountTier}</StatusTag></div><p className="company-summary">{company.summary}</p>
      <section className="drawer-section"><div className="section-line"><span className="section-kicker">CHANNEL CLASSIFICATION</span>{company.manuallyEdited && <StatusTag tone="blue">Manual override</StatusTag>}</div><div className="role-tags large-tags">{company.roles.map((role) => <StatusTag key={role} tone={role === "ISP" ? "violet" : "neutral"}>{role}</StatusTag>)}</div><div className="edit-grid"><label>Account Tier<select value={company.accountTier} onChange={(event) => onUpdate({ accountTier: event.target.value as AccountTier })}>{tierOptions.map((tier) => <option key={tier}>{tier}</option>)}</select></label><label>Supply Model<select value={company.supplyModel} onChange={(event) => onUpdate({ supplyModel: event.target.value as SupplyModel })}>{supplyOptions.map((supply) => <option key={supply}>{supply}</option>)}</select></label><label>Opportunity Stage<select value={company.opportunityStage} onChange={(event) => onUpdate({ opportunityStage: event.target.value as OpportunityStage })}>{stageOptions.map((stage) => <option key={stage}>{stage}</option>)}</select></label><label>Brand Involvement<select value={company.brandInvolvement} onChange={(event) => onUpdate({ brandInvolvement: event.target.value as CompanyRecord["brandInvolvement"] })}>{["Light", "Standard", "Deep"].map((value) => <option key={value}>{value}</option>)}</select></label></div></section>
      <section className="drawer-section"><span className="section-kicker">ROLE-SPECIFIC ASSESSMENT</span><div className="assessment-grid"><div><span>Fit score</span><MiniBar value={company.fitScore}/><b>{company.fitScore}</b></div><div><span>Account value</span><MiniBar value={company.accountValue} tone="blue"/><b>{company.accountValue}</b></div><div><span>Reachability</span><MiniBar value={company.reachability} tone="amber"/><b>{company.reachability}</b></div><div><span>Evidence</span><MiniBar value={company.evidenceConfidence}/><b>{company.evidenceConfidence}</b></div></div></section>
      <section className="drawer-section"><span className="section-kicker">EVIDENCE · FACTS</span><div className="evidence-stack">{company.evidence.map((item) => <button key={item.id} className="evidence-card" onClick={() => onEvidence(item)}><div><StatusTag tone={item.status === "Verified" || item.status === "Corroborated" ? "green" : "amber"}>{item.status}</StatusTag><span>{item.id}</span></div><strong>{item.claim}</strong><small>{item.title} · captured {item.capturedAt}</small></button>)}</div></section>
      <section className="drawer-section"><span className="section-kicker">RISKS & UNKNOWNS</span><ul className="risk-list">{company.risks.map((risk) => <li key={risk}><span>Risk</span>{risk}</li>)}{company.unknowns.map((unknown) => <li key={unknown}><span className="unknown">Unknown</span>{unknown}</li>)}</ul></section>
    </div><footer className="drawer-footer"><button className="secondary-button" onClick={onClose}>关闭</button><button className="primary-button" onClick={onOpenAssistant}><Icon name="spark"/>生成开发计划</button></footer>
  </aside></div>;
}

function EvidenceModal({ evidence, onClose }: { evidence: Evidence; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="evidence-modal" role="dialog" aria-modal="true" aria-label="证据详情"><header><div><span className="section-kicker">EVIDENCE RECORD</span><h2>{evidence.id}</h2></div><button className="close-button" onClick={onClose} aria-label="关闭证据"><Icon name="close"/></button></header><div className="evidence-metadata"><div><span>Status</span><StatusTag tone={evidence.status === "Verified" || evidence.status === "Corroborated" ? "green" : "amber"}>{evidence.status}</StatusTag></div><div><span>Confidence</span><strong>{evidence.confidence}%</strong></div><div><span>Source type</span><strong>{evidence.sourceType}</strong></div><div><span>Captured</span><strong>{evidence.capturedAt}</strong></div></div><div className="claim-box"><span>SUPPORTED CLAIM</span><p>{evidence.claim}</p></div><div className="summary-box"><span>PUBLIC SOURCE SUMMARY</span><p>{evidence.summary}</p></div><a className="source-link" href={evidence.sourceUrl} target="_blank" rel="noreferrer"><Icon name="external"/>打开公开来源<span>{evidence.title}</span></a><p className="evidence-disclaimer">来源摘要用于 Demo 快照与可追溯展示；在商业决策或外联前应重新核验页面新鲜度。</p></section></div>;
}
