import type { AssistantActionDto } from "@/lib/assistant/types";
import { taskCounts, taskStatusLabels } from "@/lib/assistant/task-summary";
import { marketHref } from "@/lib/sales/market-navigation";

export function SearchTaskDetail({ action }: { action: AssistantActionDto }) {
  const counts = taskCounts(action.result);
  const partial = action.status === "completed" && counts.accepted !== null && counts.accepted < action.payload.targetCount;
  return <section className="panel">
    <h2>{action.payload.countryName} · 销售线索搜索</h2>
    <p>{partial ? "运行结束，目标未填满" : taskStatusLabels[action.status]} · 目标 {action.payload.targetCount} 家</p>
    <p>{action.payload.roles.join(" · ")}</p>
    <p>创建：{action.createdAt} · 最近更新：{action.updatedAt}</p>
    <dl>{([["发现",counts.discovered],["已评估",counts.assessed],["合格",counts.qualified],["最终保存",counts.accepted],["搜索/补证额度",counts.creditsUsed]] as const).map(([label,value]) =>
      <div key={label}><dt>{label}</dt><dd>{value ?? "尚无记录"}</dd></div>)}</dl>
    <p>各阶段数量不能相加；合格不等于已保存。额度不等于美元总成本。</p>
    {action.errorMessage && <p role="alert">{action.errorMessage}</p>}
    {partial && <p>缺口 {Math.max(0,action.payload.targetCount-(counts.accepted ?? 0))} 家；具体停止原因需结合运行日志核实。</p>}
    <a href={marketHref(action.payload.countryCode,"leads")}>查看该国家候选库（含其他任务结果）</a>
    <details><summary>原始任务要求</summary><p style={{whiteSpace:"pre-wrap"}}>{action.payload.userRequest}</p></details>
  </section>;
}
