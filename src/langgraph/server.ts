import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

import type { AssistantConversationTurn, LeadSearchPlan } from "@/lib/assistant/types";
import { assistantBusinessGraph, executeAssistantWorkflowGraph } from "@/lib/assistant/graph";
import type { LeadWorkflowResult } from "@/lib/leads/workflow/types";
import { executeLeadWorkflowGraph, leadBusinessTopologyGraph } from "@/lib/leads/workflow/graph";
import { executeKnowledgeWorkflow, knowledgeBusinessGraph } from "@/lib/knowledge/graph";
import type { KnowledgeResult } from "@/lib/knowledge/response";
import type { KnowledgeBaseType } from "@/lib/rag/types";

const channelRoles = [
  "Distributor", "VAD", "VAR", "Dealer", "Reseller", "Retailer", "E-tailer",
  "SI", "Installer", "MSP", "ISP", "Agent", "Brand Owner",
] as const;

const leadPlanSchema = z.object({
  countryCode: z.string().regex(/^[A-Za-z]{2}$/),
  countryName: z.string().trim().min(1).max(120),
  objective: z.enum(["new-market", "existing-distributor-growth"]),
  roles: z.array(z.enum(channelRoles)).min(1).max(channelRoles.length),
  targetCount: z.number().int().min(1).max(200),
  queryLanguage: z.string().trim().min(2).max(20),
  userRequest: z.string().trim().min(1).max(8_000),
  opportunityTargets: z.array(z.literal("OEM/ODM")).max(1).optional(),
  coverageMode: z.enum(["auto", "local", "national", "mixed"]).optional(),
  verifiedOnly: z.boolean().optional(),
});

const assistantInputSchema = z.object({
  userId: z.string().uuid(),
  content: z.string().trim().min(1).max(8_000),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(8_000),
  })).max(50).default([]),
});

const leadInputSchema = z.object({
  userId: z.string().uuid(),
  actionId: z.string().uuid(),
  graphThreadId: z.string().min(1).max(200).regex(/^[^\u0000-\u001f\u007f]+$/),
  plan: leadPlanSchema,
});

const knowledgeInputSchema = z.object({
  userId: z.string().uuid(),
  question: z.string().trim().min(3).max(4_000),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(8_000),
  })).max(50).default([]),
  collections: z.array(z.enum(["industry", "company", "product"])).max(3).optional(),
  entry: z.enum(["assistant", "knowledge-page"]),
});

const RuntimeHealthState = Annotation.Root({
  probe: Annotation<string | undefined>(),
  status: Annotation<"ready" | undefined>(),
  service: Annotation<string | undefined>(),
});

const AssistantServerState = Annotation.Root({
  userId: Annotation<string>(),
  content: Annotation<string>(),
  history: Annotation<AssistantConversationTurn[]>(),
  result: Annotation<Awaited<ReturnType<typeof executeAssistantWorkflowGraph>> | undefined>(),
});

const LeadServerState = Annotation.Root({
  userId: Annotation<string>(),
  actionId: Annotation<string>(),
  graphThreadId: Annotation<string>(),
  plan: Annotation<LeadSearchPlan>(),
  result: Annotation<LeadWorkflowResult | undefined>(),
});

const KnowledgeServerState = Annotation.Root({
  userId: Annotation<string>(),
  question: Annotation<string>(),
  history: Annotation<AssistantConversationTurn[]>(),
  collections: Annotation<KnowledgeBaseType[] | undefined>(),
  entry: Annotation<"assistant" | "knowledge-page">(),
  result: Annotation<KnowledgeResult | undefined>(),
});

export interface StandaloneWorkflowDependencies {
  executeAssistantGraph: typeof executeAssistantWorkflowGraph;
  executeLeadGraph: typeof executeLeadWorkflowGraph;
  executeKnowledgeGraph: typeof executeKnowledgeWorkflow;
}

const productionDependencies: StandaloneWorkflowDependencies = {
  executeAssistantGraph: executeAssistantWorkflowGraph,
  executeLeadGraph: executeLeadWorkflowGraph,
  executeKnowledgeGraph: executeKnowledgeWorkflow,
};

export function buildRuntimeHealthGraph() {
  return new StateGraph(RuntimeHealthState)
    .addNode("report_ready", () => ({
      status: "ready" as const,
      service: "network-channel-langgraph",
    }))
    .addEdge(START, "report_ready")
    .addEdge("report_ready", END)
    .compile();
}

export function buildAssistantServerGraph(
  dependencies: Pick<StandaloneWorkflowDependencies, "executeAssistantGraph"> = productionDependencies,
) {
  return new StateGraph(AssistantServerState)
    .addNode("validate_assistant_request", (state) => assistantInputSchema.parse(state))
    .addNode("assistant_business_flow", async (state) => {
      const input = assistantInputSchema.parse(state);
      return { result: await dependencies.executeAssistantGraph(input.userId, input.content, input.history) };
    }, {
      subgraphs: [assistantBusinessGraph],
      metadata: { layer: "business", workflow: "assistant" },
    })
    .addNode("publish_assistant_result", (state) => {
      if (!state.result) throw new Error("Assistant business flow completed without a result");
      return {};
    })
    .addEdge(START, "validate_assistant_request")
    .addEdge("validate_assistant_request", "assistant_business_flow")
    .addEdge("assistant_business_flow", "publish_assistant_result")
    .addEdge("publish_assistant_result", END)
    .compile({
      name: "assistant_workflow",
      description: "Complete product assistant orchestration with an expandable business-flow subgraph.",
    });
}

export function buildLeadServerGraph(
  dependencies: Pick<StandaloneWorkflowDependencies, "executeLeadGraph"> = productionDependencies,
) {
  return new StateGraph(LeadServerState)
    .addNode("validate_lead_request", (state) => leadInputSchema.parse(state))
    .addNode("lead_business_flow", async (state) => {
      const input = leadInputSchema.parse(state);
      return { result: await dependencies.executeLeadGraph(input) };
    }, {
      subgraphs: [leadBusinessTopologyGraph],
      metadata: { layer: "business", workflow: "lead" },
    })
    .addNode("publish_lead_result", (state) => {
      if (!state.result) throw new Error("Lead business flow completed without a result");
      return {};
    })
    .addEdge(START, "validate_lead_request")
    .addEdge("validate_lead_request", "lead_business_flow")
    .addEdge("lead_business_flow", "publish_lead_result")
    .addEdge("publish_lead_result", END)
    .compile({
      name: "lead_workflow",
      description: "Complete product lead orchestration with an expandable checkpointed business-flow subgraph.",
    });
}

export function buildKnowledgeServerGraph(
  dependencies: Pick<StandaloneWorkflowDependencies, "executeKnowledgeGraph"> = productionDependencies,
) {
  return new StateGraph(KnowledgeServerState)
    .addNode("validate_knowledge_request", (state) => knowledgeInputSchema.parse(state))
    .addNode("knowledge_business_flow", async (state) => {
      const input = knowledgeInputSchema.parse(state);
      return {
        result: await dependencies.executeKnowledgeGraph(input.userId, {
          question: input.question,
          history: input.history,
          collections: input.collections,
          entry: input.entry,
        }),
      };
    }, {
      subgraphs: [knowledgeBusinessGraph],
      metadata: { layer: "business", workflow: "knowledge" },
    })
    .addNode("publish_knowledge_result", (state) => {
      if (!state.result) throw new Error("Knowledge business flow completed without a result");
      return {};
    })
    .addEdge(START, "validate_knowledge_request")
    .addEdge("validate_knowledge_request", "knowledge_business_flow")
    .addEdge("knowledge_business_flow", "publish_knowledge_result")
    .addEdge("publish_knowledge_result", END)
    .compile({
      name: "knowledge_workflow",
      description: "Shared document, verified-fact, and generated knowledge orchestration.",
    });
}

export const runtimeHealthGraph = buildRuntimeHealthGraph();
export const assistantWorkflowGraph = buildAssistantServerGraph();
export const leadWorkflowGraph = buildLeadServerGraph();
export const knowledgeWorkflowGraph = buildKnowledgeServerGraph();
