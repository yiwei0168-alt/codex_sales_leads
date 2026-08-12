"use client";

import { useEffect, useState } from "react";
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

export function KnowledgeBase() {
  const [stats, setStats] = useState<KnowledgeStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("墨西哥市场应该优先开发哪些类型的渠道节点？为什么？");
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
      const content = await uploadFile.text();
      if (!content.trim()) throw new Error("文件没有可读取的文本内容");
      const fileSlug = uploadFile.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-");
      const externalId = uploadType === "product"
        ? `product:${entityId.trim().toLowerCase()}:${fileSlug}`
        : uploadType === "company"
          ? `company:cudy-technology:${fileSlug}`
          : `industry:${fileSlug}`;
      const response = await fetch("/api/knowledge/documents", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}),
        },
        body: JSON.stringify({
          collection: uploadType, externalId, title: uploadTitle.trim(), content,
          sourceUrl: uploadSource.trim() || undefined,
          sourceType: uploadSource.trim() ? "user-upload-with-source" : "user-upload-internal",
          authorityLevel: uploadSource.trim() ? 4 : 5,
          language: "zh-CN",
          market: uploadType === "industry" ? (entityId.trim() || undefined) : undefined,
          companyId: uploadType === "company" ? "cudy-technology" : undefined,
          productId: uploadType === "product" ? entityId.trim() : undefined,
          metadata: { originalFilename: uploadFile.name, uploadedBy: "knowledge-admin-ui" },
        }),
      });
      const body = await response.json() as { chunks?: number; error?: string };
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

    <div className="kb-main-grid">
      <section className="panel rag-playground">
        <div className="panel-header"><div><span className="section-kicker">GROUNDED RAG PLAYGROUND</span><h2>基于知识库提问</h2></div><span className={`kb-provider ${stats.configured ? "ready" : ""}`}><i/>{stats.provider}</span></div>
        <div className="rag-controls">
          <label>检索范围</label><div className="kb-filter-row">{(["industry", "company", "product"] as KnowledgeBaseType[]).map((type) => <button key={type} className={selected.includes(type) ? "active" : ""} onClick={() => toggle(type)}><span>{selected.includes(type) ? "✓" : "+"}</span>{labels[type].title}</button>)}</div>
          <label htmlFor="rag-question">问题</label><textarea id="rag-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="询问市场、公司、产品或跨知识库问题…"/>
          <div className="rag-submit-row"><span>答案仅使用达到阈值的知识片段，并显示 chunk 引用。</span><button className="primary-button" disabled={querying || !stats.configured || selected.length === 0} onClick={ask}>{querying ? "检索与生成中…" : "运行 RAG 查询"}</button></div>
        </div>
        {error && <div className="rag-error">{error}</div>}
        {answer && <div className="rag-result"><div className="rag-result-meta"><span className={answer.grounded ? "grounded" : "ungrounded"}>{answer.grounded ? "Grounded" : "Needs review"}</span><span>{answer.model}</span><span>{answer.latencyMs} ms</span></div><div className="rag-answer">{answer.answer}</div>{answer.warnings.map((warning) => <p className="rag-warning" key={warning}>⚠ {warning}</p>)}<div className="rag-citations"><strong>检索证据 · {answer.citations.length}</strong>{answer.citations.map((citation) => <a key={citation.chunkId} href={citation.sourceUrl} target="_blank" rel="noreferrer"><span>[KB:{citation.chunkId.slice(0, 8)}…]</span><div><b>{citation.documentTitle}</b><small>{citation.excerpt}</small></div><em>{Math.round(citation.score * 100)}%</em></a>)}</div></div>}
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
          {uploadType === "industry" && <label>市场 / 范围（可选）<input value={entityId} onChange={(event) => setEntityId(event.target.value)} placeholder="例如：Global、Mexico、EMEA"/></label>}
          {uploadType === "company" && <label>品牌方公司<input value="Cudy Technology" readOnly/></label>}
          <label>知识文件<input id="kb-file" type="file" accept=".md,.txt,.csv,.json,text/plain,text/markdown,text/csv,application/json" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}/><small>当前支持 UTF-8 Markdown、TXT、CSV、JSON；单文档最多 2 MB。</small></label>
          <label>管理 Token<input type="password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="KNOWLEDGE_ADMIN_TOKEN（本地开发可留空）"/></label>
          <div className="kb-upload-action"><span className={uploadMessage.startsWith("上传成功") ? "success" : ""}>{uploadMessage}</span><button className="primary-button" disabled={uploading || !uploadFile || !uploadTitle.trim() || (uploadType === "product" && !entityId.trim()) || !stats.configured} onClick={upload}>{uploading ? "分块与向量化中…" : "上传并建立索引"}</button></div>
        </div>
      </div>
    </section>
  </div>;
}
