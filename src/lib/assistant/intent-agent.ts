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
    reply: "旧版任务入口已停用。请在对话页选择快速问答、标准工作或深入研究模式后重新提交。",
    plannerModel: "none", plannerSource: "disabled", plannerCalls: [],
    warnings: ["legacy-intent-disabled"],
  };
}
