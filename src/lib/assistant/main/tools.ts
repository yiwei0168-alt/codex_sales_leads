import { z } from "zod";
import { tenantQuery } from "@/lib/rag/db";
import { hybridSearch, getKnowledgeStats } from "@/lib/rag/repository";
import { resolveVerifiedFacts } from "@/lib/knowledge/fact-repository";
import { findProductActionCompanies } from "../product-actions";
import { listMemories } from "@/lib/outreach/memory-management";
import { taskFeedSql, type TaskFeedItem } from "../task-feed";
import { readTaskDetail } from "../task-detail";
import { result, toolResultSchema, type ExecutionContext, type ProductTool, type ToolResult } from "./contracts";
import { listRuns } from "./repository";
import { randomUUID } from "node:crypto";
import { addManualCompany, manualCompanySchema } from "@/lib/sales/manual-company";
import { updateDevelopmentDraft } from "@/lib/outreach/repository";
import { runDevelopmentStrategyAgent } from "@/lib/outreach/graph";
import { listMailboxConnections, getMailboxMessageForReview } from "@/lib/mailbox/repository";
import { sendMailSchema, sendOutbound, listOutbound } from "@/lib/mailbox/outbound";
import { buildLeadMarketPlaybook } from "@/lib/leads/workflow/playbook";
import { ALL_CHANNEL_ROLES } from "@/lib/leads/workflow/types";

export function defineTool<T extends z.ZodType>(options: {
  id: string; description: string; input: T;
  execute: (input: z.infer<T>, context: ExecutionContext) => Promise<ToolResult>;
} & Partial<Pick<ProductTool, "role" | "effect" | "dependencies" | "connections" | "cost" | "recovery">>): ProductTool {
  return { version: "1", role: "member", effect: "read", dependencies: [], connections: [], cost: "known", recovery: "read-retry",
    ...options, output: toolResultSchema, execute: (input, context) => options.execute(options.input.parse(input), context) };
}
const empty = z.object({}).strict();
export const productTools: ProductTool[] = [
  defineTool({ id: "knowledge_search", description: "Search accessible knowledge evidence using lexical and structured lanes, without another answer model. Returns chunks and source coordinates; v3 remains authoritative.",
    input: z.object({ query: z.string().min(2).max(4000), limit: z.number().int().min(1).max(20).default(8) }).strict(),
    execute: async (i, c) => result(await hybridSearch(c.userId, i.query, null, {}, i.limit), { cost: "known" }) }),
  defineTool({ id: "knowledge_facts", description: "Read verified facts for an entity and explicit attribute keys. Missing facts stay unknown; quarantined facts are not formal evidence.",
    input: z.object({ entity: z.string().min(1).max(180), attributes: z.array(z.string().max(120)).min(1).max(30) }).strict(),
    execute: async (i, c) => result(await resolveVerifiedFacts(c.userId, i.entity, i.attributes), { cost: "known" }) }),
  defineTool({ id: "knowledge_status", description: "Read accessible knowledge coverage and counts.", input: empty,
    execute: async (_, c) => result(await getKnowledgeStats(c.userId), { cost: "known" }) }),
  defineTool({ id: "knowledge_originals", description: "Find accessible original documents by title or asset ID; return authenticated download links, never host paths.",
    input: z.object({ query: z.string().max(180).default(""), assetId: z.uuid().optional() }).strict(),
    execute: async (i, c) => {
      const rows = await tenantQuery<{ id: string; title: string; mime: string; sha256: string }>(c.userId, `select a.id,d.title,a.mime_type as mime,a.source_sha256 as sha256 from knowledge_asset a join knowledge_document d on d.id=a.document_id
        where (d.visibility='shared' or d.owner_id=$1) and a.registration_status='registered' and ($2::uuid is null or a.id=$2)
        and d.title ilike $3 escape E'\\\\' order by a.updated_at desc limit 20`, [c.userId, i.assetId ?? null, `%${i.query.replace(/[\\%_]/g, "\\$&")}%`]);
      return result(rows, { artifacts: rows.map(r => ({ id: r.id, title: r.title, url: `/api/knowledge/assets/${r.id}` })), cost: "known" });
    } }),
  defineTool({ id: "company_search", description: "Query saved account companies by literal name/domain and optional market; no discovery prerequisite.",
    input: z.object({ query: z.string().max(180), countryCode: z.string().regex(/^[A-Z]{2}$/).optional() }).strict(),
    execute: async (i, c) => result(await findProductActionCompanies(c.userId, { kind: "library", companyQuery: i.query, countryCode: i.countryCode }), { cost: "known" }) }),
  defineTool({ id: "company_read", description: "Read the account's company/market state and saved evidence, without generating a score or re-running discovery.",
    input: z.object({ candidateId: z.string().min(1).max(200) }).strict(),
    execute: async (i, c) => result(await tenantQuery(c.userId, `select wc.candidate_id,wc.market_country_code,wc.record,wc.updated_at
      from user_company_market wc join market_workspace w on w.id=wc.workspace_id where w.owner_id=$1 and wc.candidate_id=$2 limit 10`, [c.userId, i.candidateId]), { cost: "known" }) }),
  defineTool({ id: "task_list", description: "Read existing business task status and new Agent runs for this account.", input: empty,
    execute: async (_, c) => result({ agentRuns: await listRuns(c.userId), legacy: await tenantQuery<TaskFeedItem>(c.userId, taskFeedSql, [c.userId, "all", "all", "all", 0]) }, { cost: "known" }) }),
  defineTool({ id: "task_detail", description: "Read saved business task detail, progress and receipts.",
    input: z.object({ id: z.uuid(), kind: z.enum(["search", "contacts", "draft", "send", "relationship", "generation"]) }).strict(),
    execute: async (i, c) => result(await readTaskDetail(c.userId, i.id, i.kind), { cost: "known" }) }),
  defineTool({ id: "memory_list", description: "Read the account's existing sourced preferences and policies. Retains historical memory identities.", input: empty,
    execute: async (_, c) => result(await listMemories(c.userId, 0), { cost: "known" }) }),
  defineTool({ id: "company_add", description: "Add a user-nominated company directly, without discovery or scoring prerequisites. It remains unverified until separately assessed.",
    input: manualCompanySchema, effect: "reversible", recovery: "idempotent",
    execute: async (i, c) => result(await addManualCompany(c.userId, i), { cost: "known" }) }),
  defineTool({ id: "draft_edit", description: "Replace an existing editable draft body without rerunning the strategy Agent or sending mail.",
    input: z.object({ draftId: z.uuid(), body: z.string().min(1).max(30_000) }).strict(), effect: "reversible", recovery: "idempotent",
    execute: async (i, c) => result({ updated: await updateDevelopmentDraft(c.userId, i.draftId, { body: i.body }) }, { cost: "known" }) }),
  defineTool({ id: "development_workflow", description: "Optional existing complete development strategy and draft workflow for a saved company; creates a draft, never sends.",
    input: z.object({ companyExternalId: z.string().min(1).max(180), language: z.string().max(20).optional(), instructions: z.string().max(2000).optional() }).strict(), effect: "reversible", cost: "unknown", connections: ["specialist-models"],
    execute: async (i, c) => result(await runDevelopmentStrategyAgent(c.userId, i)) }),
  defineTool({ id: "market_plan", description: "Generate a market plan directly from the user's market and roles. No mandatory product/company/industry retrieval; retrieve only task-relevant facts first.",
    input: z.object({ countryCode: z.string().regex(/^[A-Z]{2}$/), countryName: z.string().min(1).max(120), objective: z.enum(["new-market", "existing-distributor-growth"]),
      roles: z.array(z.enum(ALL_CHANNEL_ROLES)).min(1).max(13), targetCount: z.number().int().min(1).max(200), queryLanguage: z.string().min(2).max(20), userRequest: z.string().min(1).max(8000) }).strict(),
    cost: "unknown", connections: ["openrouter"], execute: async i => result(await buildLeadMarketPlaybook(i, [])) }),
  defineTool({ id: "mail_connections", description: "List current account mailbox identities and connection states; no credentials.", input: empty,
    execute: async (_, c) => result((await listMailboxConnections(c.userId)).map(v => ({ id: v.id, email: v.email, status: v.status })), { cost: "known" }) }),
  defineTool({ id: "mail_history", description: "Read outbound history for a company, or unassociated account mail when company is omitted.",
    input: z.object({ companyExternalId: z.string().max(180).optional(), offset: z.number().int().min(0).max(100000).default(0) }).strict(),
    execute: async (i, c) => result(await listOutbound(c.userId, i.companyExternalId ?? "", i.offset, 20), { cost: "known" }) }),
  defineTool({ id: "mail_read", description: "Read one account-owned imported message for the current task. This private content must not be sent to web search or unrelated external tools.",
    input: z.object({ messageId: z.uuid() }).strict(), execute: async (i, c) => result(await getMailboxMessageForReview(c.userId, i.messageId), { cost: "known" }) }),
  defineTool({ id: "mail_send", description: "Send final custom mail with optional company linkage and hash-bound registered attachments. Always requires exact user approval; unknown SMTP receipts are not retried.",
    input: sendMailSchema.omit({ confirmed: true, idempotencyKey: true }).strict(), effect: "send", recovery: "reconcile", cost: "unknown", connections: ["mailbox"],
    execute: async (i, c) => {
      const receipt = await sendOutbound(c.userId, { ...i, confirmed: true, idempotencyKey: randomUUID() });
      return result(receipt, { status: receipt.status === "sent" ? "success" : receipt.status === "failed" ? "unavailable" : "unknown", receipt: receipt.id });
    } }),
  defineTool({ id: "plan_confirmation", description: "Obtain user approval for a large/batch/uncertain paid plan before executing it. Explain scale; include rough cost only if the user asked. Does not itself spend or authorize email contents.",
    input: z.object({ plan: z.string().min(1).max(8000), scale: z.string().min(1).max(1000), uncertainty: z.string().max(2000), requestedEstimate: z.string().max(1000).optional() }).strict(), effect: "publish", recovery: "idempotent",
    execute: async i => result({ approvedPlan: i }, { cost: "known" }) }),
];
export function availableTools(context: Pick<ExecutionContext, "role">, tools = productTools) {
  return tools.filter(t => t.role === "member" || context.role === "admin");
}
export function describeTool(tool: ProductTool) {
  const { execute: _execute, input, output, ...metadata } = tool;
  void _execute;
  return { ...metadata, inputSchema: z.toJSONSchema(input), outputSchema: z.toJSONSchema(output) };
}
