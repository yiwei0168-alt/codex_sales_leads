import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

import type { AssistantConversationTurn, LeadSearchPlan } from "@/lib/assistant/types";
import { runAssistantWorkflow } from "@/lib/assistant/graph";
import type { LeadWorkflowResult } from "@/lib/leads/workflow/types";
import { runLeadWorkflow } from "@/lib/leads/workflow/graph";

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
  graphThreadId: z.string().uuid(),
  plan: leadPlanSchema,
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
  result: Annotation<Awaited<ReturnType<typeof runAssistantWorkflow>> | undefined>(),
});

const LeadServerState = Annotation.Root({
  userId: Annotation<string>(),
  actionId: Annotation<string>(),
  graphThreadId: Annotation<string>(),
  plan: Annotation<LeadSearchPlan>(),
  result: Annotation<LeadWorkflowResult | undefined>(),
});

export interface StandaloneWorkflowDependencies {
  runAssistant: typeof runAssistantWorkflow;
  runLead: typeof runLeadWorkflow;
}

const productionDependencies: StandaloneWorkflowDependencies = {
  runAssistant: runAssistantWorkflow,
  runLead: runLeadWorkflow,
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
  dependencies: Pick<StandaloneWorkflowDependencies, "runAssistant"> = productionDependencies,
) {
  return new StateGraph(AssistantServerState)
    .addNode("run_assistant_workflow", async (state) => {
      const input = assistantInputSchema.parse(state);
      return { result: await dependencies.runAssistant(input.userId, input.content, input.history) };
    })
    .addEdge(START, "run_assistant_workflow")
    .addEdge("run_assistant_workflow", END)
    .compile();
}

export function buildLeadServerGraph(
  dependencies: Pick<StandaloneWorkflowDependencies, "runLead"> = productionDependencies,
) {
  return new StateGraph(LeadServerState)
    .addNode("run_lead_workflow", async (state) => {
      const input = leadInputSchema.parse(state);
      return { result: await dependencies.runLead(input) };
    })
    .addEdge(START, "run_lead_workflow")
    .addEdge("run_lead_workflow", END)
    .compile();
}

export const runtimeHealthGraph = buildRuntimeHealthGraph();
export const assistantWorkflowGraph = buildAssistantServerGraph();
export const leadWorkflowGraph = buildLeadServerGraph();
