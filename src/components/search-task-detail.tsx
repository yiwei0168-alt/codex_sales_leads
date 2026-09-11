import type { AssistantActionDto } from "@/lib/assistant/types";
import { taskCounts, taskStatusLabels } from "@/lib/assistant/task-summary";
import { marketHref } from "@/lib/sales/market-navigation";
import { TaskRunControls } from "./task-run-controls";
import { SearchContinuation } from "./search-continuation";

export function SearchTaskDetail({ action }: { action: AssistantActionDto }) {
  const counts = taskCounts(action.result);
  const partial = action.status === "completed" && counts.accepted !== null && counts.accepted < action.payload.targetCount;
  const continuation=action.result.continuation&&typeof action.result.continuation==='object'?action.result.continuation as Record<string,unknown>:null;
  const stopReason=({"target-met":"目标已满足","confirmed-exhaustion":"新增有效候选持续不足，已达到停滞结束条件","provider-unavailable":"搜索服务不可用","maximum-rounds":"达到搜索轮次上限"} as Record<string,string>)[String(action.result.targetCompletionReason)];
  return <section className="panel">
    <h2>{action.payload.countryName} · 销售线索搜索</h2>
    <p>{partial ? "运行结束，目标未填满" : taskStatusLabels[action.status]} · 目标 {action.payload.targetCount} 家</p>
    <p>{action.payload.roles.join(" · ")}</p>
    {continuation&&<p>第 {String(continuation.depth)} 次缺口续搜 · 排除前序已评估 {String(continuation.excludedCount)} 家 · <a href={`/tasks/${encodeURIComponent(String(continuation.parentActionId))}?kind=search`}>查看原任务（原费用保留）</a></p>}
    <TaskRunControls actionId={action.id} status={action.status}/>
    <p>创建：{action.createdAt} · 最近更新：{action.updatedAt}</p>
    <dl>{([["发现",counts.discovered],["已评估",counts.assessed],["合格",counts.qualified],["最终保存",counts.accepted],["搜索/补证额度",counts.creditsUsed]] as const).map(([label,value]) =>
      <div key={label}><dt>{label}</dt><dd>{value ?? "尚无记录"}</dd></div>)}</dl>
    <p>各阶段数量不能相加；合格不等于已保存。额度不等于美元总成本。</p>
    {action.result.deliveryCounts&&typeof action.result.deliveryCounts==="object"?<p>交付入库：新增 {String((action.result.deliveryCounts as Record<string,unknown>).added??"未知")} · 更新 {String((action.result.deliveryCounts as Record<string,unknown>).updated??"未知")} · 主角色发生变化 {String((action.result.deliveryCounts as Record<string,unknown>).roleChanged??"未知")}（包含在更新中，不额外相加；人工主角色仍优先）</p>:<p>历史任务未记录新增/更新拆分，未从当前候选库倒推。</p>}
    {action.errorMessage && <p role="alert">{action.errorMessage}</p>}
    {stopReason&&<p>停止原因：{stopReason}</p>}
    {partial && <p>缺口 {Math.max(0,action.payload.targetCount-(counts.accepted ?? 0))} 家；{stopReason??"历史记录未保存结构化停止原因，请展开检查点核实。"}</p>}
    {partial&&action.result.targetCompletionReason!=='confirmed-exhaustion'&&Number(continuation?.depth??0)<3&&<SearchContinuation key={action.id} actionId={action.id}/>}
    <a href={marketHref(action.payload.countryCode,"leads")}>查看该国家候选库（含其他任务结果）</a>
    <details><summary>原始任务要求</summary><p style={{whiteSpace:"pre-wrap"}}>{action.payload.userRequest}</p></details>
  </section>;
}
