"use client";

import { useEffect, useState } from "react";
import { PersonalMemory } from "./personal-memory";
import { KnowledgeLibrary } from "./knowledge-library";
import { KnowledgeReviewCenter } from "./knowledge-review-center";
import type { KnowledgeBaseType, KnowledgeStats, RagAnswer } from "@/lib/rag/types";

const labels: Record<KnowledgeBaseType, { title: string; eyebrow: string; description: string }> = {
  industry: { title: "行业知识库", eyebrow: "INDUSTRY", description: "渠道模型、市场结构、术语、规则与研究" },
  company: { title: "公司知识库", eyebrow: "COMPANY", description: "真实公司身份、公开证据、能力与关系" },
  product: { title: "产品知识库", eyebrow: "PRODUCT", description: "规格、定位、差异化、场景与限制" },
};

const emptyStats: KnowledgeStats = {
  configured: false,
  provider: "PostgreSQL + pgvector",
  collections: (["industry", "company", "product"] as KnowledgeBaseType[]).map((type) => ({ type, documentCount: 0, chunkCount: 0, embeddedCount: 0 })),
};

interface MailboxKnowledgeItem {
  id: string;
  message_id: string;
  kind: "company-policy" | "customer-signal" | "email-template";
  title: string;
  content: string;
  confidence: number | null;
  rationale: string | null;
  model: string | null;
  reviewed_at: string;
}

interface KnowledgeUploadJob {
  id:string;collection:KnowledgeBaseType;status:"pending"|"running"|"extracted"|"registered"|"failed";title:string;
  originalFilename:string;documentType:string;byteSize:string;errorCode:string|null;createdAt:string;updatedAt:string;
}

function ComparisonTable({comparison}:{comparison:NonNullable<RagAnswer["comparison"]>}) {
  const statusLabel={verified:"已验证",unknown:"未知",conflicting:"冲突",candidate:"待复核","version-mismatch":"版本不一致"} as const;
  const format=(value:typeof comparison.attributes[number]["left"]):string=>value.status==="verified"?`${typeof value.value==="string"?value.value:JSON.stringify(value.value)}${value.unit?` ${value.unit}`:""}`:statusLabel[value.status];
  return <div className="rag-comparison"><h3>关键差异</h3>{comparison.differences.length?<ul>{comparison.differences.map(row=><li key={row.attributeKey}><strong>{row.attributeKey}</strong><span>{format(row.left)}</span><i>→</i><span>{format(row.right)}</span></li>)}</ul>:<p>暂无双方均有已验证证据的确定差异。</p>}<h3>完整共同属性</h3><div className="rag-comparison-table" role="table"><div className="head" role="row"><b>属性</b><b>{comparison.entities[0].key}</b><b>{comparison.entities[1].key}</b></div>{comparison.attributes.map(row=><div role="row" key={row.attributeKey} className={row.isDifference?"different":""}><strong>{row.attributeKey}</strong><span data-status={row.left.status}>{format(row.left)}</span><span data-status={row.right.status}>{format(row.right)}</span></div>)}</div></div>;
}

const mailboxKindLabels: Record<MailboxKnowledgeItem["kind"], string> = {
  "company-policy": "公司政策",
  "customer-signal": "客户信号",
  "email-template": "邮件模板",
};

export function KnowledgeBase() {
  const [stats, setStats] = useState<KnowledgeStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("基于现有产品组合，进入一个新市场时应该优先开发哪些渠道节点？为什么？");
  const [selected, setSelected] = useState<KnowledgeBaseType[]>(["industry", "company", "product"]);
  const [answer, setAnswer] = useState<RagAnswer | null>(null);
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState("");
  const [uploadType, setUploadType] = useState<KnowledgeBaseType>("industry");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadSource, setUploadSource] = useState("");
  const [entityId, setEntityId] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadJobs,setUploadJobs]=useState<KnowledgeUploadJob[]>([]);
  const [mailboxKnowledge, setMailboxKnowledge] = useState<MailboxKnowledgeItem[]>([]);
  const [mailboxKnowledgeError, setMailboxKnowledgeError] = useState("");

  function loadStats() {
    setLoading(true);
    fetch("/api/knowledge/status", { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, body: await response.json() as KnowledgeStats }))
      .then(({ body }) => setStats(body))
      .catch((reason: Error) => setStats({ ...emptyStats, error: reason.message }))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetch("/api/knowledge/status", { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, body: await response.json() as KnowledgeStats }))
      .then(({ body }) => setStats(body))
      .catch((reason: Error) => setStats({ ...emptyStats, error: reason.message }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(()=>{
    let disposed=false;let timer:ReturnType<typeof setTimeout>|undefined;
    async function load(){try{const response=await fetch("/api/knowledge/uploads",{cache:"no-store"});const body=await response.json() as {jobs?:KnowledgeUploadJob[]};
      if(!disposed&&response.ok){const jobs=body.jobs??[];setUploadJobs(jobs);if(jobs.some(job=>job.status==="pending"||job.status==="running"))timer=setTimeout(load,5000);}}
      catch{/* Upload-job status is supplementary to the existing knowledge page. */}}
    void load();return()=>{disposed=true;if(timer)clearTimeout(timer);};
  },[uploadMessage]);

  useEffect(() => {
    fetch("/api/knowledge/mailbox", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { items?: MailboxKnowledgeItem[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "邮箱知识读取失败");
        setMailboxKnowledge(body.items ?? []);
      })
      .catch((reason: Error) => setMailboxKnowledgeError(reason.message));
  }, []);

  function toggle(type: KnowledgeBaseType) {
    setSelected((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]);
  }

  async function ask() {
    if (!question.trim() || selected.length === 0) return;
    setQuerying(true); setError(""); setAnswer(null);
    try {
      const response = await fetch("/api/rag/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, filters: { collections: selected }, maxChunks: 8 }),
      });
      const body = await response.json() as RagAnswer & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "查询失败");
      setAnswer(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "查询失败");
    } finally { setQuerying(false); }
  }

  async function upload() {
    if (!uploadFile || !uploadTitle.trim()) return;
    setUploading(true); setUploadMessage("");
    try {
      const binary=/\.(pdf|pptx|xlsx)$/i.test(uploadFile.name);
      if(binary){
        const form=new FormData();form.set("file",uploadFile);form.set("collection",uploadType);form.set("title",uploadTitle.trim());
        form.set("sourceUrl",uploadSource.trim());form.set("visibility","private");form.set("entityKey",entityId.trim());
        const response=await fetch("/api/knowledge/uploads",{method:"POST",headers:adminToken?{authorization:`Bearer ${adminToken}`}:{},body:form});
        const body=await response.json() as {id?:string;status?:string;error?:string};if(!response.ok)throw new Error(body.error??"二进制资料上传失败");
        setUploadMessage(`上传成功：原件已保存，提取作业 ${body.id?.slice(0,8)??""} 等待本地 worker。`);
        setUploadFile(null);setUploadTitle("");setUploadSource("");setEntityId("");
        const input=document.getElementById("kb-file") as HTMLInputElement|null;if(input)input.value="";return;
      }
      const content = await uploadFile.text();
      if (!content.trim()) throw new Error("文件没有可读取的文本内容");
      const fileSlug = uploadFile.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-");
      const externalId = uploadType === "product"
        ? `product:${entityId.trim().toLowerCase()}:${fileSlug}`
        : uploadType === "company"
          ? `company:cudy-technology:${fileSlug}`
          : `industry:${fileSlug}`;
      setUploadMessage("正在检查版本并生成检索片段…");
      const payload={
          collection: uploadType, externalId, title: uploadTitle.trim(), content,
          sourceUrl: uploadSource.trim() || undefined,
          sourceType: uploadSource.trim() ? "user-upload-with-source" : "user-upload-internal",
          authorityLevel: uploadSource.trim() ? 4 : 5,
          language: "zh-CN",
          market: uploadType === "industry" ? (entityId.trim() || undefined) : undefined,
          companyId: uploadType === "company" ? "cudy-technology" : undefined,
          productId: uploadType === "product" ? entityId.trim() : undefined,
          metadata: { originalFilename: uploadFile.name, uploadedBy: "knowledge-admin-ui" },
        };
      async function submit(expectedContentHash?:string){return fetch("/api/knowledge/documents",{method:"POST",headers:{"content-type":"application/json",...(adminToken?{authorization:`Bearer ${adminToken}`}:{})},body:JSON.stringify({...payload,expectedContentHash})});}
      let response=await submit();
      let body=await response.json() as {chunks?:number;error?:string;conflict?:boolean;expectedContentHash?:string};
      if(response.status===409&&body.conflict&&body.expectedContentHash){
        if(!window.confirm("同名知识存在不同内容，覆盖会替换其检索片段。确认用当前上传内容更新吗？")){setUploadMessage("已取消覆盖，原知识未改变。");return;}
        setUploadMessage("正在保存已确认的新版本…");response=await submit(body.expectedContentHash);body=await response.json();
      }
      if (!response.ok) throw new Error(body.error ?? "上传失败");
      setUploadMessage(`上传成功：已生成 ${body.chunks ?? 0} 个知识片段。`);
      setUploadFile(null); setUploadTitle(""); setUploadSource(""); setEntityId("");
      const fileInput = document.getElementById("kb-file") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
      loadStats();
    } catch (reason) {
      setUploadMessage(reason instanceof Error ? reason.message : "上传失败");
    } finally { setUploading(false); }
  }

  return <div className="knowledge-layout">
    <PersonalMemory />
    <KnowledgeLibrary />
    {!loading && !stats.configured && <div className="kb-config-banner"><span>!</span><div><strong>RAG 尚未完成运行配置</strong><p>{stats.error ?? "请配置 PostgreSQL、pgvector 与 OpenAI API Key。"}</p></div><code>docker compose up -d → npm run db:migrate → npm run kb:seed</code></div>}

    <section className="kb-stats-grid">
      {stats.collections.map((collection) => {
        const meta = labels[collection.type];
        const readiness = collection.chunkCount ? Math.round(collection.embeddedCount / collection.chunkCount * 100) : 0;
        return <article className={`kb-stat-card ${collection.type}`} key={collection.type}>
          <div className="kb-stat-head"><span>{meta.eyebrow}</span><i>{readiness}% ready</i></div>
          <h3>{meta.title}</h3><p>{meta.description}</p>
          <div className="kb-counts"><strong>{collection.documentCount}<small>文档</small></strong><strong>{collection.chunkCount}<small>Chunks</small></strong><strong>{collection.embeddedCount}<small>向量</small></strong></div>
          <div className="kb-readiness"><span style={{ width: `${readiness}%` }}/></div>
        </article>;
      })}
    </section>

    {stats.release&&<section className="panel rag-release-status"><div className="panel-header"><div><span className="section-kicker">RAG V3 RELEASE</span><h2>{stats.release.key}</h2></div><span className={`tag ${stats.release.active?"green":"neutral"}`}>{stats.release.active?"active":stats.release.status}</span></div><div className="kb-counts"><strong>{stats.release.completeAssets}/{stats.release.registeredAssets}<small>资产完成</small></strong><strong>{stats.release.chunks}<small>Chunks</small></strong><strong>{stats.release.qwenEmbeddings}<small>Qwen</small></strong><strong>{stats.release.bgeEmbeddings}<small>BGE</small></strong><strong>{stats.release.openReviews}<small>待复核</small></strong><strong>{stats.release.conflictFacts}<small>冲突事实</small></strong></div>{!stats.release.active&&<p className="subtle">影子 release 尚未激活；当前生产查询继续使用既有索引。</p>}</section>}
    {stats.release&&<KnowledgeReviewCenter/>}

    <section className="panel mailbox-knowledge-panel">
      <div className="panel-header"><div><span className="section-kicker">PRIVATE MAILBOX KNOWLEDGE</span><h2>邮箱学习知识</h2><p>仅当前账号可见；已批准内容会参与私有 RAG 检索。</p></div><span className="tag violet">{mailboxKnowledge.length} 条</span></div>
      {mailboxKnowledgeError && <div className="rag-error">{mailboxKnowledgeError}</div>}
      <div className="mailbox-knowledge-list">
        {mailboxKnowledge.map((item) => <details key={item.id}>
          <summary><span className="tag neutral">{mailboxKindLabels[item.kind]}</span><strong>{item.title || "未命名邮箱知识"}</strong><small>{item.reviewed_at?.slice(0, 10)}</small></summary>
          <div className="mailbox-knowledge-content"><p>{item.content}</p><div>{item.model && <span>{item.model}</span>}{item.confidence !== null && <span>置信度 {Math.round(item.confidence * 100)}%</span>}</div>{item.rationale && <small>{item.rationale}</small>}</div>
        </details>)}
        {!mailboxKnowledgeError && mailboxKnowledge.length === 0 && <p className="subtle">暂无已批准的邮箱学习知识。请先在“邮箱学习”中批准候选。</p>}
      </div>
    </section>

    <div className="kb-main-grid">
      <section className="panel rag-playground">
        <div className="panel-header"><div><span className="section-kicker">GROUNDED RAG PLAYGROUND</span><h2>基于知识库提问</h2></div><span className={`kb-provider ${stats.configured ? "ready" : ""}`}><i/>{stats.provider}</span></div>
        <div className="rag-controls">
          <label>检索范围</label><div className="kb-filter-row">{(["industry", "company", "product"] as KnowledgeBaseType[]).map((type) => <button key={type} className={selected.includes(type) ? "active" : ""} onClick={() => toggle(type)}><span>{selected.includes(type) ? "✓" : "+"}</span>{labels[type].title}</button>)}</div>
          <label htmlFor="rag-question">问题</label><textarea id="rag-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="询问市场、公司、产品或跨知识库问题…"/>
          <div className="rag-submit-row"><span>资料和已验证事实走本地快速路径；复杂问题才进入检索与生成。</span><button className="primary-button" disabled={querying || selected.length === 0} onClick={ask}>{querying ? "知识工作流运行中…" : "运行知识工作流"}</button></div>
        </div>
        {error && <div className="rag-error">{error}</div>}
        {answer && <div className="rag-result"><div className="rag-result-meta"><span className={answer.grounded ? "grounded" : "ungrounded"}>{answer.kind ?? (answer.grounded ? "Grounded" : "Needs review")}</span><span>{answer.reasonCode ?? answer.model}</span><span>{answer.latencyMs} ms</span></div><div className="rag-answer">{answer.answer}</div>{answer.comparison&&<ComparisonTable comparison={answer.comparison}/>} {answer.warnings.map((warning) => <p className="rag-warning" key={warning}>⚠ {warning}</p>)}{(answer.documents?.length ?? 0) > 0 && <div className="rag-citations"><strong>原始资料 · {answer.documents?.length}</strong>{answer.documents?.map((document) => <a key={document.assetId} href={document.url} target="_blank" rel="noreferrer"><span>{document.documentType}</span><div><b>{document.title}</b><small>{document.version ?? "未标注版本"}</small></div></a>)}</div>}{(answer.factCitations?.length ?? 0) > 0 && <div className="rag-citations"><strong>事实证据 · {answer.factCitations?.length}</strong>{answer.factCitations?.map((citation) => <a key={citation.factId} href={`/api/knowledge/assets/${citation.assetId}`} target="_blank" rel="noreferrer"><span>{citation.attributeKey}</span><div><b>{citation.rawValue}</b><small>{citation.version ?? citation.status}</small></div></a>)}</div>}<div className="rag-citations"><strong>检索证据 · {answer.citations.length}</strong>{answer.citations.map((citation) => <a key={citation.chunkId} href={citation.sourceUrl} target="_blank" rel="noreferrer"><span>[KB:{citation.chunkId.slice(0, 8)}…]</span><div><b>{citation.documentTitle} · {citation.visibility === "private" ? "私有" : "共享"}</b><small>{citation.excerpt}</small></div><em>{Math.round(citation.score * 100)}%</em></a>)}</div></div>}
      </section>

      <aside className="panel kb-pipeline">
        <div className="panel-header"><div><span className="section-kicker">INGESTION PIPELINE</span><h2>知识进入路径</h2></div></div>
        <ol><li><span>01</span><div><strong>Source validation</strong><p>记录来源、权限、时间和权威等级</p></div></li><li><span>02</span><div><strong>Semantic chunking</strong><p>保留标题路径，约 500 tokens / chunk</p></div></li><li><span>03</span><div><strong>Embedding</strong><p>text-embedding-3-small · 1536 维</p></div></li><li><span>04</span><div><strong>Hybrid retrieval</strong><p>HNSW vector + FTS + RRF</p></div></li><li><span>05</span><div><strong>Grounded answer</strong><p>Responses API · store false · 强制引用</p></div></li></ol>
        <div className="kb-command"><span>导入单个文件</span><code>npm run kb:ingest -- --type=industry --file=research.md</code></div>
        <div className="kb-guardrails"><strong>知识治理边界</strong><p>无证据不回答 · 推断显式标记 · 产品规格缺失时返回 Unknown · 管理写入需 Token</p></div>
      </aside>
    </div>

    <section className="panel kb-upload-panel">
      <div className="panel-header"><div><span className="section-kicker">KNOWLEDGE INGESTION</span><h2>上传你的知识资料</h2></div><span className="subtle">内容不会提交到 GitHub</span></div>
      <div className="kb-upload-body">
        <div className="kb-upload-intro"><strong>选择知识库</strong><p>{uploadType === "industry" ? "行业知识、渠道结构、主要品牌、市场研究等。" : uploadType === "company" ? "Cudy Technology 公司简介、产品线、当前业务情况、战略与经营资料。" : "Cudy Technology 产品信息、技术规格、兼容性、认证和使用限制。"}</p><div className="kb-upload-types">{(["industry", "company", "product"] as KnowledgeBaseType[]).map((type) => <button key={type} className={uploadType === type ? "active" : ""} onClick={() => setUploadType(type)}>{labels[type].title}</button>)}</div></div>
        <div className="kb-upload-form">
          <label>文档标题<input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder={uploadType === "company" ? "例如：Cudy Technology 公司简介 2026" : uploadType === "product" ? "例如：WR3000 技术规格 v2" : "例如：Networking 渠道结构研究"}/></label>
          <label>来源 URL（内部资料可留空）<input value={uploadSource} onChange={(event) => setUploadSource(event.target.value)} placeholder="https://..."/></label>
          {uploadType === "product" && <label>产品型号 / SKU<input value={entityId} onChange={(event) => setEntityId(event.target.value)} placeholder="例如：WR3000"/></label>}
          {uploadType === "industry" && <label>市场 / 范围（可选）<input value={entityId} onChange={(event) => setEntityId(event.target.value)} placeholder="例如：Global、Germany、EMEA"/></label>}
          {uploadType === "company" && <label>品牌方公司<input value="Cudy Technology" readOnly/></label>}
          <label>知识文件<input id="kb-file" type="file" accept=".md,.txt,.csv,.json,.pdf,.pptx,.xlsx,text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}/><small>文本最多 2 MB并直接索引；PDF、PPTX、XLSX 最多25 MB，先保存原件并进入本地异步提取，不自动公开或向量化。</small></label>
          <label>管理 Token<input type="password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="KNOWLEDGE_ADMIN_TOKEN（本地开发可留空）"/></label>
          <div className="kb-upload-action"><span className={uploadMessage.startsWith("上传成功") ? "success" : ""}>{uploadMessage}</span><button className="primary-button" disabled={uploading || !uploadFile || !uploadTitle.trim() || (uploadType === "product" && !entityId.trim()) || !stats.configured} onClick={upload}>{uploading ? "正在提交…" : /\.(pdf|pptx|xlsx)$/i.test(uploadFile?.name??"") ? "上传并创建提取作业" : "上传并建立索引"}</button></div>
          {uploadJobs.length>0&&<div className="kb-upload-jobs"><strong>最近提取作业</strong>{uploadJobs.slice(0,6).map(job=><p key={job.id}><span className={`tag ${job.status==="extracted"||job.status==="registered"?"green":job.status==="failed"?"red":"neutral"}`}>{job.status==="registered"?"已登记（RAG v3 待发布）":job.status}</span> {job.title} · {job.documentType} · {Math.ceil(Number(job.byteSize)/1024)} KB{job.errorCode?` · ${job.errorCode}`:""}</p>)}</div>}
        </div>
      </div>
    </section>
  </div>;
}
