"use client";

import { Fragment, useState, useEffect, useRef } from "react";
import { GlobalMarketOverview } from "./global-market-overview";
import { LeadFilters } from "./lead-filters";
import { CompanyDetail } from "./company-detail";
import { useDialogFocus } from "./use-dialog-focus";
import { useRouter } from "next/navigation";
import { UserChannelMap } from "@/components/user-channel-map";
import { OpportunityWorkspace } from "@/components/opportunity-workspace";
import { OutboundComposer } from "@/components/outbound-composer";
import { stageLabel } from "@/lib/sales/opportunity-stages";
import { evidenceFreshness } from "@/lib/sales/evidence-freshness";
import { marketCode, marketHref, marketLabel } from "@/lib/sales/market-navigation";
import { AssistantHome } from "@/components/assistant-home";
import { KnowledgeBase } from "@/components/knowledge-base";
import { TaskCenter } from "@/components/task-center";
import { MailboxIntegration } from "@/components/mailbox-integration";
import {
  primaryRole,
  type AccountTier,
  type ChannelRole,
  type CompanyRecord,
  type Evidence,
} from "@/lib/domain";
import type {
  CompanyEditablePatch,
  MarketWorkspaceDto,
} from "@/lib/sales/types";
import type { DevelopmentStrategyDto } from "@/lib/outreach/types";

type View = "home" | "overview" | "results" | "map" | "opportunities" | "assistant" | "tasks" | "knowledge" | "mailbox";
type Mode = "new-market" | "growth";
type SearchState = "idle" | "retrieving" | "complete";

const roleOptions: ChannelRole[] = [
  "Distributor", "VAD", "VAR", "Dealer", "Reseller", "Retailer", "E-tailer", "SI", "Installer", "MSP", "ISP",
];
const distributorTierOptions: AccountTier[] = ["Strategic Distributor", "Priority Distributor", "Standard Distributor", "Long-tail Distributor"];
const downstreamTierOptions: AccountTier[] = ["KA", "Priority", "Standard", "Long-tail"];
const tierOptions: AccountTier[] = [...distributorTierOptions, ...downstreamTierOptions];

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


export function CopilotDemo({ initialWorkspace, userName = "Workspace Owner", initialCountry = "all", initialView = "home" }: { initialWorkspace?: MarketWorkspaceDto; userName?: string; initialCountry?: string; initialView?: View }) {
  const router = useRouter();
  const [view, setViewState] = useState<View>(initialView);
  const country = marketCode(initialCountry);
  function setView(next: View) {
    if (next === "results" || next === "map" || next === "opportunities") {
      router.push(marketHref(country, next === "results" ? "leads" : next === "map" ? "channel-map" : "opportunities"));
    } else setViewState(next);
  }
  const [mode, setMode] = useState<Mode>(initialWorkspace?.mode ?? "new-market");
  const [companies, setCompanies] = useState<CompanyRecord[]>(initialWorkspace?.companies ?? []);
  const [contactsByCompanyId,setContactsByCompanyId]=useState(initialWorkspace?.contactsByCompanyId??{});
  const workspaceRevision=useRef(0);
  const [refreshVersion,setRefreshVersion]=useState(0);
  const countries = [...new Set([...companies.map((company) => marketCode(company.country)), ...(initialWorkspace?.taskCountries ?? [])])];
  if (country !== "all" && !countries.includes(country)) countries.push(country);
  const countryCompanies = companies.filter((company) => country === "all" || marketCode(company.country) === country);
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
  const [failedEdit, setFailedEdit] = useState<{ id: string; patch: CompanyEditablePatch } | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const pendingSaves=useRef(0);
  useEffect(()=>{
    if(!["results","map","opportunities","overview"].includes(view))return;
    const controller=new AbortController();let pending=false;
    async function refresh(){if(pending||document.hidden||pendingSaves.current)return;pending=true;const version=workspaceRevision.current;
      try{const response=await fetch("/api/workspaces/current",{signal:controller.signal,cache:"no-store"});if(!response.ok)throw new Error();const workspace=await response.json() as MarketWorkspaceDto;
        if(!controller.signal.aborted&&version===workspaceRevision.current&&!pendingSaves.current){setCompanies(workspace.companies);setContactsByCompanyId(workspace.contactsByCompanyId);}
      }catch{if(!controller.signal.aborted)setSaveState("error");}finally{pending=false;}}
    void refresh();const timer=window.setInterval(()=>void refresh(),30000);return()=>{controller.abort();window.clearInterval(timer);};
  },[view,refreshVersion]);
  const sourceCount = companies.reduce((total, company) => total + company.evidence.length, 0);
  const searchDate = initialWorkspace?.latestSearch?.finishedAt?.slice(0, 10) ?? "Not searched";

  const selectedCompany = companies.find((item) => item.id === selectedId) ?? countryCompanies[0];
  const draftRequest = useRef(0);
  const selectedCompanyId=selectedCompany?.id;
  useEffect(()=>{
    if(view!=="assistant"||!selectedCompanyId)return;
    const controller=new AbortController();const requestId=++draftRequest.current;
    fetch(`/api/development-strategies?company=${encodeURIComponent(selectedCompanyId)}`,{signal:controller.signal,cache:"no-store"})
      .then(async response=>{if(!response.ok)throw new Error();return response.json();})
      .then(({result}:{result:DevelopmentStrategyDto|null})=>{if(controller.signal.aborted||requestId!==draftRequest.current)return;
        if(result){setDevelopmentResult(result);setDraft(result.draft.body);setDevelopmentState(result.status==="approved"?"approved":"ready");}})
      .catch(()=>{if(!controller.signal.aborted)setDevelopmentError("已有草稿读取失败，请切换页面重试；未自动生成新版本。");});
    return()=>controller.abort();
  },[view,selectedCompanyId]);
  const shortlist = countryCompanies.filter((company) => !["Discovered", "Excluded"].includes(company.opportunityStage));

  const filteredCompanies = (() => {
    const term = query.trim().toLowerCase();
    return companies
      .filter((company) => country === "all" || marketCode(company.country) === country)
      .filter((company) => roleFilter === "All" || primaryRole(company) === roleFilter)
      .filter((company) => tierFilter === "All" || company.accountTier === tierFilter)
      .filter((company) => !term || [company.displayName, company.city, company.domain, company.roles.join(" ")].join(" ").toLowerCase().includes(term))
      .sort((a, b) => b.fitScore - a.fitScore);
  })();

  function updateCompany(id: string, patch: CompanyEditablePatch): Promise<boolean> {
    workspaceRevision.current++;pendingSaves.current++;
    const pending=saveQueue.current.then(()=>persistCompany(id,patch)).finally(()=>{pendingSaves.current--;});
    saveQueue.current=pending;
    return pending;
  }
  async function persistCompany(id: string, patch: CompanyEditablePatch): Promise<boolean> {
    setSaveState("saving");
    try {
      const response = await fetch(`/api/workspaces/current/companies/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error("保存失败");
      const result = await response.json() as { company: CompanyRecord };
      setCompanies((items) => items.map((item) => item.id === id ? {...item,...result.company} : item));
      if(patch.primaryBusinessRole!==undefined||patch.accountTier!==undefined||patch.selectedPathId!==undefined||patch.selectedCooperationPath!==undefined||patch.supplyModel!==undefined)setDevelopmentResult(current=>current?.companyExternalId===id?{...current,contextReview:"changed"}:current);
      setFailedEdit(null);
      setSaveState("saved");
      window.setTimeout(() => {if(!pendingSaves.current)setSaveState("idle");}, 1600);
      return true;
    } catch {
      setSaveState("error");
      setFailedEdit({ id, patch });
      return false;
    }
  }

  function selectCompany(id: string, openDrawer = true) {
    draftRequest.current++;
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
    const requestId=++draftRequest.current;
    setDevelopmentState("generating");
    setDevelopmentError("");
    try {
      const response = await fetch("/api/development-strategies", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyExternalId: company.id, language: "en", tone: "consultative" }),
      });
      const payload = await response.json() as { result?: DevelopmentStrategyDto; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || "开发策略生成失败");
      if(requestId!==draftRequest.current)return;
      setDevelopmentResult(payload.result);
      setDraft(payload.result.draft.body);
      setDevelopmentFeedback("");
      setFeedbackMessage("");
      setAllowFeedbackMemory(false);
      setDevelopmentState("ready");
    } catch (error) {
      if(requestId!==draftRequest.current)return;
      setDevelopmentState("error");
      setDevelopmentError(error instanceof Error ? error.message : "开发策略生成失败");
    }
  }

  async function approveDevelopmentDraft() {
    if (!developmentResult || developmentState === "approving") return;
    const requestId=++draftRequest.current;
    setDevelopmentState("approving");
    setDevelopmentError("");
    try {
      const response = await fetch(`/api/development-strategies/${developmentResult.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft, approve: true }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "草稿批准失败");
      if(requestId!==draftRequest.current)return;
      setDevelopmentResult({ ...developmentResult, status: "approved", draft: { ...developmentResult.draft, body: draft } });
      setDevelopmentState("approved");
    } catch (error) {
      if(requestId!==draftRequest.current)return;
      setDevelopmentState("error");
      setDevelopmentError(error instanceof Error ? error.message : "草稿批准失败");
    }
  }

  async function reviseDevelopmentDraft() {
    if (!developmentResult || developmentFeedback.trim().length < 3 || developmentState === "revising") return;
    const requestId=++draftRequest.current;
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
      if(requestId!==draftRequest.current)return;
      setDevelopmentResult(payload.result.draft);
      setDraft(payload.result.draft.draft.body);
      setDevelopmentFeedback("");
      setAllowFeedbackMemory(false);
      setFeedbackMessage(payload.result.memoryStored
        ? `已完成第 ${payload.result.draft.revision} 版；这条反馈已提炼到个人策略记忆：${payload.result.memorySummary}`
        : `已完成第 ${payload.result.draft.revision} 版；该反馈用于本次修改，但未进入长期记忆：${payload.result.memoryReason}`);
      setDevelopmentState("ready");
    } catch (error) {
      if(requestId!==draftRequest.current)return;
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
          <div className="top-actions"><button onClick={()=>setRefreshVersion(value=>value+1)}>刷新已保存数据</button><span className={`snapshot-badge ${saveState === "error" ? "save-error" : ""}`}><span className="live-dot"/>{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到 RDS" : saveState === "error" ? "保存失败，请重试" : `Global workspace · ${searchDate}`}</span><button className="avatar small">{userName.slice(0, 2).toUpperCase()}</button></div>
        </header>

        <div className="workspace-content">
          {failedEdit && <div role="alert">修改尚未保存，原值已保留。<button onClick={() => void updateCompany(failedEdit.id, failedEdit.patch)}>重试保存</button></div>}
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

          {searchState === "complete" && <div className="inline-notice success"><Icon name="check"/><span>当前工作区包含 {companies.length} 个已存储候选、{sourceCount} 条证据；请在公司详情查看各自的评分版本与核实状态。</span><button onClick={() => setSearchState("idle")} aria-label="关闭"><Icon name="close" size={15}/></button></div>}

          {(view === "results" || view === "map") && <div className="results-toolbar"><label className="select-field">国家<select aria-label="选择国家" value={country} onChange={(event) => router.push(marketHref(event.target.value, view === "map" ? "channel-map" : "leads"))}><option value="all">{view === "map" ? "请选择国家" : "全部国家"}</option>{countries.sort().map((code) => <option key={code} value={code}>{marketLabel(code)} · {companies.filter((company) => marketCode(company.country) === code).length}</option>)}</select></label></div>}
          {view === "home" && <AssistantHome userName={userName} onOpenResults={(code) => router.push(marketHref(code, "leads"))} onOpenCompany={(id,kind)=>{selectCompany(id,kind==="library");if(kind!=="library")setView("assistant");}} />}
          {view === "opportunities" && <label>国家<select value={country} onChange={event=>router.push(marketHref(event.target.value,"opportunities"))}><option value="all">全部国家</option>{countries.sort().map(code=><option key={code} value={code}>{marketLabel(code)}</option>)}</select></label>}
          {view === "overview" && <GlobalMarketOverview companies={companies} />}
          {view === "results" && <LeadFilters companies={filteredCompanies} onUpdate={updateCompany}>{items=><Results companies={items} query={query} setQuery={setQuery} roleFilter={roleFilter} setRoleFilter={setRoleFilter} tierFilter={tierFilter} setTierFilter={setTierFilter} onSelect={selectCompany} onToggle={(company) => updateCompany(company.id, { opportunityStage: company.opportunityStage === "Discovered" ? "Qualified" : "Discovered" })} />}</LeadFilters>}
          {view === "map" && (country === "all" ? <p className="subtle">请选择国家以查看渠道节点与关系。</p> : <UserChannelMap key={country} country={country} companies={countryCompanies} onSelect={selectCompany} onAdded={(company)=>setCompanies(items=>[...items,company])} />)}
          {view === "opportunities" && <OpportunityWorkspace companies={shortlist} onSelect={selectCompany} onUpdate={updateCompany} onOpenMail={(id)=>{selectCompany(id,false);setView("assistant");}} />}
          {view === "assistant" && selectedCompany && <DevelopmentAssistant company={selectedCompany} result={developmentResult} draft={draft} setDraft={setDraft} state={developmentState} error={developmentError} feedback={developmentFeedback} setFeedback={setDevelopmentFeedback} feedbackMessage={feedbackMessage} allowMemory={allowFeedbackMemory} setAllowMemory={setAllowFeedbackMemory} onGenerate={() => void generateDevelopment()} onRevise={() => void reviseDevelopmentDraft()} onApprove={() => void approveDevelopmentDraft()} onEvidence={setEvidenceOpen} onChoose={() => setDetailOpen(true)} />}
          {view === "assistant" && selectedCompany && <OutboundComposer key={selectedCompany.id} companyId={selectedCompany.id} draft={draft} onSent={()=>{void fetch("/api/workspaces/current",{cache:"no-store"}).then(async response=>{if(response.ok){const workspace=await response.json() as MarketWorkspaceDto;setCompanies(workspace.companies);}});}}/>}
          {view === "tasks" && <TaskCenter />}
          {view === "knowledge" && <KnowledgeBase />}
          {view === "mailbox" && <MailboxIntegration />}
        </div>
      </main>

      {detailOpen && selectedCompany && <CompanyDetail key={selectedCompany.id} company={selectedCompany} contactDetails={contactsByCompanyId[selectedCompany.id]} onClose={() => setDetailOpen(false)} onUpdate={(patch) => updateCompany(selectedCompany.id, patch)} onEvidence={setEvidenceOpen} onOpenAssistant={() => { setDetailOpen(false); setView("assistant"); }} />}
      {evidenceOpen && <EvidenceModal evidence={evidenceOpen} onClose={() => setEvidenceOpen(null)} />}
    </div>
  );
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
          <thead><tr><th aria-label="加入开发名单"/><th>公司</th><th>主角色</th><th>账户等级</th><th>综合评分</th><th>合作路径</th><th>开发阶段</th><th aria-label="操作"/></tr></thead>
          <tbody>{countryGroups.map(([country, countryCompanies]) => <Fragment key={country}>
            <tr className="country-group-row"><td colSpan={8}><strong>{country}</strong><span>{countryCompanies.length} 家公司</span></td></tr>
            {countryCompanies.map((company) => (
            <tr key={company.id} className={company.manuallyEdited ? "manual-row" : ""}>
              <td><input type="checkbox" checked={company.opportunityStage !== "Discovered" && company.opportunityStage !== "Excluded"} onChange={() => onToggle(company)} aria-label={`切换 ${company.displayName} 的 shortlist 状态`}/></td>
              <td><button className="company-cell" onClick={() => onSelect(company.id)}><span className="company-avatar">{company.displayName.slice(0, 2).toUpperCase()}</span><span><strong>{company.displayName}</strong><small>{company.city} · {company.domain}</small></span></button></td>
              <td><StatusTag>{primaryRole(company)}</StatusTag>{evidenceFreshness(company.evidence) === "older-than-year" && <small>超过一年未核实</small>}</td>
              <td><StatusTag tone={company.accountTier === "KA" ? "amber" : company.accountTier === "Priority" ? "blue" : "neutral"}>{company.accountTier}</StatusTag></td>
              <td>{company.userAdded && company.assessmentNeedsRefresh ? "尚未评估" : company.assessmentNeedsRefresh ? <span title={`历史评分：${company.fitScore}`}>评分待更新</span> : <ScoreRing value={company.fitScore} compact/>}</td>
              <td><span className="supply-copy">{company.selectedCooperationPath ?? "未分析"}</span>{company.manuallyEdited && <small className="manual-badge">用户修改</small>}</td>
              <td><span className={`stage-dot ${company.opportunityStage.toLowerCase().replace(" ", "-")}`}/>{stageLabel(company.opportunityStage)}</td>
              <td><button className="row-action" onClick={() => onSelect(company.id)} aria-label={`打开 ${company.displayName} 详情`}><Icon name="chevron" size={16}/></button></td>
            </tr>
          ))}</Fragment>)}{companies.length === 0 && <tr><td colSpan={8}>当前国家或筛选条件下暂无候选公司。</td></tr>}</tbody>
        </table>
      </div>
      <div className="table-footer"><span>已保存的候选公司</span><span>评分依据、来源与修改记录请查看公司详情。</span></div>
    </section>
  );
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
      {result?.contextReview&&result.contextReview!=="current"&&<div className="safety-banner" role="status"><span>{result.contextReview==="changed"?"公司角色、路径、证据或可用知识/关系记录已变化：请复核历史策略。不会自动重生成或产生费用。":"此历史策略没有完整上下文版本记录，请核对当前角色、路径、证据与知识后使用。"}</span></div>}
      {result?.warnings.map((warning) => <div className="safety-banner" key={warning}><span>{warning}</span></div>)}
    </section>
    <section className="panel draft-panel"><div className="panel-header"><div><span className="section-kicker">OUTREACH DRAFT · REVIEW REQUIRED</span><h2>{result?.draft.language === "en" ? "英文触达草稿" : "定制触达草稿"}</h2></div><div className="draft-actions"><button className="secondary-button" disabled={state === "generating" || state === "revising"} onClick={onGenerate}>{state === "generating" ? "生成中…" : "重新生成"}</button><button className="secondary-button" disabled={!result || state === "approving" || state === "approved" || state === "revising"} onClick={onApprove}>{state === "approved" ? "已批准" : state === "approving" ? "保存中…" : "确认并批准"}</button><button className="primary-button" disabled={!draft} onClick={() => navigator.clipboard?.writeText(draft)}><Icon name="check"/>复制草稿</button></div></div><div className="safety-banner"><Icon name="spark"/><span>每一版都必须人工审核确认。事实引用已在服务端校验；批准不会触发邮件发送。</span></div>{result?.draft.subjectOptions.length ? <div className="assistant-section"><span className="section-kicker">SUBJECT OPTIONS</span><ul className="title-list">{result.draft.subjectOptions.map((subject) => <li key={subject}>{subject}</li>)}</ul></div> : null}<textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={state === "generating" ? "Kimi 正在生成…" : "生成后可在此人工编辑"} aria-label="开发信草稿"/>{result ? <div className="assistant-section"><span className="section-kicker">FEEDBACK & REVISION</span><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="例如：增加荷兰 MediaMarkt 的品牌背书；语气更像我之前的长邮件；CTA 不要太强。" aria-label="开发信优化反馈"/><label className="memory-consent"><input type="checkbox" checked={allowMemory} onChange={(event) => setAllowMemory(event.target.checked)}/><span><strong>允许写入个人长期记忆</strong><small>仅当 Agent 判断为可跨公司复用的市场、渠道或稳定风格经验时写入；联系人、单家公司措辞和未证实事实不会记忆。</small></span></label><button className="secondary-button" disabled={feedback.trim().length < 3 || state === "revising"} onClick={onRevise}>{state === "revising" ? "正在修改并筛选记忆…" : "提交人工评价并生成新版本"}</button>{feedbackMessage && <div className="safety-banner"><span>{feedbackMessage}</span></div>}</div> : null}<div className="draft-foot"><span>{result ? `Revision ${result.revision} · ${result.draft.wordCount} words` : `${draft.length} characters`}</span><span>{result?.evidenceIds.length ?? 0} company evidence · {result?.knowledgeIds.length ?? 0} strategy KB references</span><span>{result ? `${result.generationMetrics.modelCalls} model call · ${(result.generationMetrics.latencyMs / 1000).toFixed(1)}s · ${result.generationMetrics.totalTokens ?? "n/a"} tokens` : "Single-call Kimi v2"}</span><span>{result?.promptVersion ?? "Kimi Agent v2"}</span></div></section>
  </div>;
}



function EvidenceModal({ evidence, onClose }: { evidence: Evidence; onClose: () => void }) {
  const dialogRef=useDialogFocus(onClose);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} tabIndex={-1} className="evidence-modal" role="dialog" aria-modal="true" aria-label="证据详情"><header><div><span className="section-kicker">EVIDENCE RECORD</span><h2>{evidence.id}</h2></div><button className="close-button" onClick={onClose} aria-label="关闭证据"><Icon name="close"/></button></header><div className="evidence-metadata"><div><span>Status</span><StatusTag tone={evidence.status === "Verified" || evidence.status === "Corroborated" ? "green" : "amber"}>{evidence.status}</StatusTag></div><div><span>Confidence</span><strong>{evidence.confidence}%</strong></div><div><span>Source type</span><strong>{evidence.sourceType}</strong></div><div><span>Captured</span><strong>{evidence.capturedAt}</strong></div></div><div className="claim-box"><span>SUPPORTED CLAIM</span><p>{evidence.claim}</p></div><div className="summary-box"><span>PUBLIC SOURCE SUMMARY</span><p>{evidence.summary}</p></div><a className="source-link" href={evidence.sourceUrl} target="_blank" rel="noreferrer"><Icon name="external"/>打开公开来源<span>{evidence.title}</span></a><p className="evidence-disclaimer">此处展示已保存证据，并不代表刚刚重新核实。请参考来源类型和采集日期；超过一年仅提醒，不自动判无效。</p></section></div>;
}
