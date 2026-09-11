import type { AssistantActionDto } from "./types";

export const taskStatusLabels: Record<AssistantActionDto["status"], string> = {
  proposed: "待确认", confirmed: "已排队", running: "运行中", completed: "已完成", failed: "失败", cancelled: "已取消",
};
export function taskCounts(result: Record<string, unknown>) {
  const count = (key: string) => typeof result[key] === "number" && Number.isFinite(result[key]) && result[key] >= 0 ? result[key] as number : null;
  return { discovered: count("discovered"), assessed: count("assessed"), qualified: count("qualified"),
    accepted: count("accepted"), creditsUsed: count("creditsUsed") };
}
