import { z } from "zod";
import { defineTool } from "./tool-definition";
import { result } from "./contracts";
import { tenantQuery } from "@/lib/rag/db";
import { listRelationships, relationshipSchema, saveRelationship } from "@/lib/sales/relationships";
import { analyzeStoredRelationship } from "@/lib/sales/relationship-analysis";
import { contactLookupProvider } from "@/providers/contact-lookup-factory";
import { lookupAndStoreContacts } from "@/lib/contacts/lookup-service";
import { syncAliMail } from "@/lib/mailbox/service";
import { mailboxSyncSchema } from "@/lib/mailbox/sync-options";
import { readSpendBudget } from "@/lib/billing/repository";
import { controlRun, getRun, readEvents } from "./repository";
import { searchExternalWithGemini } from "../external-search";
import { createDiscoveryProvider, discoveryEnvironmentStatus } from "@/providers/discovery";
import { DISCOVERY_PROVIDER_IDS, SEARCH_CATEGORY_IDS } from "@/lib/leads/workflow/hybrid-search-policy";
import { loadDevelopmentContext } from "@/lib/outreach/repository";
import { generateDevelopmentStrategyPlanWithKimi, generateDevelopmentStrategyWithKimi } from "@/lib/outreach/kimi-agent";
import {readSavedCompanyAssessment,listCompanyCorrespondence} from "@/lib/sales/company-detail-read";
import {readTaskUsage} from "../task-usage";
import {createFollowUpDraft,listSavedFollowUps} from "@/lib/outreach/follow-up-service";
import { queueAgentLeadWorkflow } from "@/lib/leads/workflow/agent-launch";
import { ALL_CHANNEL_ROLES } from "@/lib/leads/workflow/types";

const companyId = z.string().min(1).max(180), country = z.string().regex(/^[A-Z]{2}$/);
const developmentInput = z.object({ companyExternalId: companyId, language: z.string().max(20).optional(), instructions: z.string().max(2000).optional() }).strict();
export const businessTools = [
  defineTool({ id: "lead_workflow", description: "Queue the existing complete sales-lead workflow as an optional account task. Requires exact approval of the market, role, count and public search scope. Returns the saved action/job receipt and current state; queued is not completed. Never launches a second job for the same Agent call.",
    input: z.object({ countryCode: country, countryName: z.string().min(2).max(120), objective: z.enum(["new-market", "existing-distributor-growth"]),
      roles: z.array(z.enum(ALL_CHANNEL_ROLES)).min(1).max(10), targetCount: z.number().int().min(1).max(100), queryLanguage: z.string().min(2).max(80), userRequest: z.string().min(2).max(4000),
      opportunityTargets: z.array(z.literal("OEM/ODM")).max(1).optional(), coverageMode: z.enum(["auto", "local", "national", "mixed"]).optional(), verifiedOnly: z.boolean().optional() }).strict(),
    effect: "publish", recovery: "composite", cost: "unknown", connections: ["lead-workflow-worker", "configured-search-providers"],
    execute: async (plan, context) => {
      if (!context.callId) return result(null, { status: "unavailable", missing: ["Persisted Agent call ID"] });
      const launch = await queueAgentLeadWorkflow(context.userId, context.runId, context.callId, plan);
      if (!launch?.jobId) return result(launch, { status: "unavailable", missing: ["Owned Agent call and successfully queued existing lead workflow"] });
      return result(launch, { artifacts: [{ id: launch.actionId, title: "销售线索工作流", url: `/tasks/${launch.actionId}?kind=search` }], receipt: launch.jobId, cost: "unknown" });
    } }),
  defineTool({id:"company_assessment_read",description:"Read the latest saved formal assessment and its scoring policy version for one owned company. Does not score, alter qualification or treat research as formal evidence.",
    input:z.object({companyExternalId:companyId}).strict(),execute:async(i,c)=>{
      const assessment=await readSavedCompanyAssessment(c.userId,i.companyExternalId);
      return assessment?result({assessment}):result({assessment:null},{status:"missing_input",missing:["Saved formal assessment for this owned company"]});
    }}),
  defineTool({id:"company_correspondence_list",description:"List linked inbound/outbound message metadata for one owned company. Read a specific account message separately for its body; links come from saved domain match or user confirmation.",
    input:z.object({companyExternalId:companyId,offset:z.number().int().min(0).max(100000).default(0)}).strict(),
    execute:async(i,c)=>{const {fetched:_fetched,companyFound,...page}=await listCompanyCorrespondence(c.userId,i.companyExternalId,i.offset);void _fetched;
      return companyFound?result(page):result(null,{status:"missing_input",missing:["Owned company in the current workspace"]});}}),
  defineTool({ id: "relationship_list", description: "Read saved company relationships for an account market.", input: z.object({ country }).strict(), execute: async (i,c) => result(await listRelationships(c.userId,i.country)) }),
  defineTool({ id: "relationship_save", description: "Save an evidenced relationship between two account companies independently of search or scoring.", input: relationshipSchema, effect: "reversible", execute: async (i,c) => result({ id: await saveRelationship(c.userId,i) }) }),
  defineTool({ id: "relationship_analyze", description: "Analyze one pair of saved companies with the existing specialist; does not require full discovery.", input: z.object({ country, from: companyId, to: companyId }).strict().refine(i=>i.from!==i.to), cost: "unknown", effect: "reversible", connections: ["relationship-model"], execute: async (i,c) => result(await analyzeStoredRelationship(c.userId,i.country,i.from,i.to)) }),
  defineTool({ id: "contacts_lookup", description: "Discover and save contacts for one account company using the configured contact provider. No scoring prerequisite. Missing connection is reported explicitly.", input: z.object({ companyExternalId: companyId, refresh: z.boolean().default(false) }).strict(), effect: "reversible", cost: "unknown", connections: ["contact-provider"], execute: async (i,c) => {
    const rows=await tenantQuery<{ id:string; canonical_name:string; domain:string; country_code:string; workspace_id:string }>(c.userId,`select s.id,s.canonical_name,s.domain,wc.market_country_code as country_code,wc.workspace_id from sales_company s join user_company_market wc on wc.company_id=s.id join market_workspace w on w.id=wc.workspace_id where w.owner_id=$1 and wc.candidate_id=$2 limit 2`,[c.userId,i.companyExternalId]);
    if(rows.length!==1) return result(null,{status:"missing_input",missing:["One accessible company and market"]});
    const company=rows[0]; if(!company.domain||company.domain.endsWith(".invalid"))return result(null,{status:"missing_input",missing:["Confirmed company domain"]});
    const provider=contactLookupProvider(); if(!provider.isConfigured())return result(null,{status:"unavailable",missing:[`Configured ${provider.id} contact connection`]});
    return result(await lookupAndStoreContacts(c.userId,company.workspace_id,{ companyId:company.id,companyName:company.canonical_name,websiteUrl:`https://${company.domain}/`,domain:company.domain,countryCode:company.country_code,targetRoles:["Owner","Procurement","Channel","Technical"] },provider,i.refresh));
  } }),
  defineTool({ id: "mail_sync", description: "Synchronize owned mailbox messages for the requested date/folder scope; stores messages without sending.", input: mailboxSyncSchema, effect: "reversible", cost: "unknown", connections: ["mailbox"], execute: async (i,c) => result(await syncAliMail(c.userId,i.connectionId,i)) }),
  defineTool({ id: "budget_read", description: "Read legacy account budget as reference data, not an MA05 spending limit. Unknown bills remain unknown.", input: z.object({}).strict(), execute: async (_,c) => result(await readSpendBudget(c.userId)) }),
  defineTool({id:"task_usage_read",description:"Read the account's last 30 days of operational efficiency and provider billing observations. Tables overlap and totals must not be added; unknown bills and adoption remain unknown.",
    input:z.object({}).strict(),execute:async(_,c)=>result(await readTaskUsage(c.userId))}),
  defineTool({ id: "run_read", description: "Read an owned Agent task and saved event receipts, including partial outcomes. Does not resume it.", input: z.object({ id:z.uuid(), after:z.string().regex(/^\d+$/).default("0") }).strict(), execute: async (i,c) => {
    const run=await getRun(c.userId,i.id); return run?result({run,events:await readEvents(c.userId,i.id,i.after)}):result(null,{status:"unavailable",missing:["Owned Agent task"]});
  } }),
  defineTool({ id: "run_control", description: "Pause, resume, cancel or append requirements to an owned Agent task at its next safe boundary. Completed work and costs remain recorded.", input: z.object({ id:z.uuid(), action:z.enum(["pause","resume","cancel","instruct"]),content:z.string().min(1).max(100000).optional() }).strict().refine(i=>i.action!=="instruct"||Boolean(i.content)), effect:"reversible", execute:async(i,c)=>result({updated:await controlRun(c.userId,i.id,i.action,i.content)}) }),
  defineTool({ id:"search_connections",description:"Discover configured public search capabilities without exposing credentials.",input:z.object({}).strict(),execute:async()=>result(discoveryEnvironmentStatus().map(s=>({providerId:s.providerId,configured:s.configured,purpose:s.purpose}))) }),
  defineTool({ id:"web_search",description:"Research public questions with Gemini Google grounding and citations. Only public queries may leave the account; first review the exact query scope. Do not include private documents, mail, credentials or policy text.",input:z.object({questions:z.array(z.string().min(2).max(2000)).min(1).max(5)}).strict(),cost:"unknown",effect:"publish",connections:["gemini-search"],execute:async i=>{
    const answer=await searchExternalWithGemini(i.questions);return result(answer,{sources:answer.citations});
  } }),
  defineTool({ id:"search_channel",description:"Run one configured discovery channel from a supplied public query, independently of market planning and knowledge retrieval. Exact public query scope requires review; raw provider payloads are not returned.",input:z.object({provider:z.enum(DISCOVERY_PROVIDER_IDS),query:z.string().min(2).max(2000),countryCode:country,countryName:z.string().max(120),languageCode:z.string().max(20),maxResults:z.number().int().min(1).max(20),category:z.enum(SEARCH_CATEGORY_IDS),engine:z.enum(["google-grounded","google","bing","google-places","brave","exa"])}).strict(),cost:"unknown",effect:"publish",connections:["discovery-provider"],execute:async i=>{
    const output=await createDiscoveryProvider(i.provider,{maxAttempts:2}).search({...i,track:"main-agent",mechanism:"independent-query"});
    const {rawResponse:_raw,...safe}=output;void _raw;return result(safe,{sources:output.sourceUrls.map(url=>({url,title:url}))});
  } }),
  defineTool({ id:"development_strategy",description:"Generate only a saved company's development strategy with the current evidence/handoff. Does not generate or send an email. Returns a saved task research result.",input:developmentInput,cost:"unknown",connections:["outreach-model"],execute:async(i,c)=>result(await generateDevelopmentStrategyPlanWithKimi(await loadDevelopmentContext(c.userId,i),i)) }),
  defineTool({ id:"draft_generate",description:"Generate a company's draft directly from current evidence and user instructions without the separate strategy-plan step. Produces a task draft; never sends or changes official company qualification.",input:developmentInput,cost:"unknown",connections:["outreach-model"],execute:async(i,c)=>result(await generateDevelopmentStrategyWithKimi(await loadDevelopmentContext(c.userId,i),i)) }),
  defineTool({id:"follow_up_list",description:"Read up to ten saved follow-up drafts for one owned sent parent message. Does not regenerate or send.",input:z.object({parentId:z.uuid()}).strict(),
    execute:async(i,c)=>result(await listSavedFollowUps(c.userId,i.parentId),{cost:"known"})}),
  defineTool({id:"follow_up_generate",description:"Generate and save a follow-up draft for an owned, company-linked sent message using bounded thread and style context. This never sends; a standalone message currently reports missing context.",
    input:z.object({parentId:z.uuid(),instructions:z.string().trim().min(2).max(2000)}).strict(),effect:"reversible",cost:"unknown",connections:["outreach-model"],
    execute:async(i,c)=>{const draft=await createFollowUpDraft(c.userId,i);
      return draft?result(draft,{cost:"unknown"}):result(null,{status:"missing_input",missing:["Owned sent parent message with company context"],cost:"known"});}}),
];
