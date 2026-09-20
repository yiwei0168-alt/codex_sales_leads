import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { executeMainAgentRun } from "./graph";

const input = z.object({ userId: z.uuid(), runId: z.uuid(), leaseToken: z.uuid() });
const state = Annotation.Root({ userId: Annotation<string>(), runId: Annotation<string>(), leaseToken: Annotation<string>(), result: Annotation<unknown>() });
export const mainAgentWorkflowGraph = new StateGraph(state)
  .addNode("resume_persisted_main_agent", async s => {
    const p = input.parse(s);
    return { result: await executeMainAgentRun(p.userId, p.runId, p.leaseToken) };
  })
  .addEdge(START, "resume_persisted_main_agent")
  .addEdge("resume_persisted_main_agent", END)
  .compile({ name: "main_agent_workflow" });
