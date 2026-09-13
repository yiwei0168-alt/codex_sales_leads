import type { AssistantActionDto } from "./types";

export const taskStatusLabels: Record<AssistantActionDto["status"], string> = {
  proposed: "待确认", confirmed: "已排队", running: "运行中", completed: "已完成", failed: "失败", cancelled: "已取消",
};
export const searchStopReasonLabels: Record<string, string> = {
  "target-met": "目标已满足", "confirmed-exhaustion": "已达到有记录的搜索耗尽条件",
  "provider-unavailable": "搜索服务不可用", "maximum-rounds": "达到搜索轮次安全上限",
  "processing-incomplete": "校正或评分未完成，已有结果和费用保留",
  "role-unresolved": "仍有公司角色待判，未认定市场耗尽",
  "qualified-shortfall": "最终审核或保存后合格数量不足",
};
export function taskCounts(result: Record<string, unknown>) {
  const count = (key: string) => typeof result[key] === "number" && Number.isFinite(result[key]) && result[key] >= 0 ? result[key] as number : null;
  return { discovered: count("discovered"), assessed: count("assessed"), qualified: count("qualified"),
    accepted: count("accepted"), creditsUsed: count("creditsUsed") };
}

export function searchTaskStatusLabel(status:AssistantActionDto["status"],accepted:number|null,targetCount:number){
  if(status!=="completed")return taskStatusLabels[status];
  if(accepted===null)return "运行结束，最终数量未记录";
  return accepted<targetCount?"运行结束，目标未填满":"目标已满足";
}
