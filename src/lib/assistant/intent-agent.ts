import type { AssistantConversationTurn, IntentPlan } from "./types";

/** MODESEL-15: compatibility response only; no classification, model or tool calls. */
export async function planAssistantRequest(
  _content: string,
  _history: AssistantConversationTurn[] = [],
): Promise<IntentPlan> {
  void _content;
  void _history;
  return {
    intent: "clarification", confidence: 0, externalQuestions: [],
    reply: "旧版任务入口已停用。请在对话页直接描述问题或任务，系统会自动选择模型与处理方式。",
    plannerModel: "none", plannerSource: "disabled", plannerCalls: [],
    warnings: ["legacy-intent-disabled"],
  };
}
