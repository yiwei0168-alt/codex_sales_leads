import type { AssistantActionDto } from "@/lib/assistant/types";
import { taskCounts, searchTaskStatusLabel, searchStopReasonLabels } from "@/lib/assistant/task-summary";
import { marketHref } from "@/lib/sales/market-navigation";
import { TaskRunControls } from "./task-run-controls";
import { SearchContinuation } from "./search-continuation";
import {TaskSpendBudget} from "./task-spend-budget";
import {ProcessingRecovery} from "./processing-recovery";
import type {RecoveryFamilySummary} from "@/lib/assistant/recovery-family-summary";

export function SearchTaskDetail({ action,refreshKey=0,recoveryFamily }: { action: AssistantActionDto;refreshKey?:number;recoveryFamily?:RecoveryFamilySummary|null }) {
  const counts = taskCounts(action.result);
  const partial = action.status === "completed" && counts.accepted !== null && counts.accepted < action.payload.targetCount;
  const shortfall = counts.accepted === null ? null : Math.max(0,action.payload.targetCount-counts.accepted);
  const continuation=action.result.continuation&&typeof action.result.continuation==='object'?action.result.continuation as Record<string,unknown>:null;
  const stopReason=searchStopReasonLabels[String(action.result.targetCompletionReason)];
  const recovery=action.result.processingRecovery&&typeof action.result.processingRecovery==='object'?action.result.processingRecovery as Record<string,unknown>:null;
  return <section className="panel">
    <h2>{action.payload.countryName} · 销售线索搜索</h2>
    <p>{searchTaskStatusLabel(action.status,counts.accepted,action.payload.targetCount)} · 目标 {action.payload.targetCount} 家</p>
    <p>{action.payload.roles.join(" · ")}</p>
    {continuation&&<p>第 {String(continuation.depth)} 次缺口续搜 · 排除前序已评估 {String(continuation.excludedCount)} 家 · <a href={`/tasks/${encodeURIComponent(String(continuation.parentActionId))}?kind=search`}>查看原任务（原费用保留）</a></p>}
    {recovery&&<p>原范围处理恢复 · 待处理公司 {String(recovery.pendingCompanies??"未知")} 家 · 原任务已保存 {String(recovery.originalAcceptedCount??"未知")} 家。下方数量仅统计本次恢复，不代表与原结果合并后的唯一公司数。<a href={`/tasks/${encodeURIComponent(String(recovery.parentActionId))}?kind=search`}>查看原任务、结果及费用</a></p>}
    {recoveryFamily&&<p>恢复链已核实唯一保存 {recoveryFamily.verifiedUniqueSaved??"无法核对"} 家 / 原目标 {recoveryFamily.target??"未知"} 家 · 当前缺口 {recoveryFamily.remaining??"无法核对"} 家 · 重复保存槽位 {recoveryFamily.duplicateSavedSlots??"无法核对"} 条{recoveryFamily.pendingTasks?` · ${recoveryFamily.pendingTasks} 个任务尚未完成，数量会更新`:""}。仅统计已完成运行的真实入库选择；未核实记录不计为零。</p>}
    <TaskRunControls key={`${action.id}:${refreshKey}`} actionId={action.id} status={action.status} processingRecovery={Boolean(recovery)}/>
    <TaskSpendBudget key={action.id} actionId={action.id}/>
    <p>创建：{action.createdAt} · 最近更新：{action.updatedAt}</p>
    <dl>{([["发现",counts.discovered],["已评估",counts.assessed],["合格",counts.qualified],["最终保存",counts.accepted],["搜索/补证额度",counts.creditsUsed]] as const).map(([label,value]) =>
      <div key={label}><dt>{label}</dt><dd>{value ?? "尚无记录"}</dd></div>)}</dl>
    <p>各阶段数量不能相加；合格不等于已保存。额度不等于美元总成本。</p>
    {action.result.deliveryCounts&&typeof action.result.deliveryCounts==="object"?<p>交付入库：新增 {String((action.result.deliveryCounts as Record<string,unknown>).added??"未知")} · 更新 {String((action.result.deliveryCounts as Record<string,unknown>).updated??"未知")} · 主角色发生变化 {String((action.result.deliveryCounts as Record<string,unknown>).roleChanged??"未知")}（包含在更新中，不额外相加；人工主角色仍优先）</p>:<p>历史任务未记录新增/更新拆分，未从当前候选库倒推。</p>}
    {action.errorMessage && <p role="alert">{action.errorMessage}</p>}
    {stopReason&&<p>停止原因：{stopReason}</p>}
    {typeof action.result.pendingRoleCount==='number'&&<p>角色待判 {action.result.pendingRoleCount} 家（未计入最终合格）</p>}
    {shortfall !== null && shortfall > 0 && <p>缺口 {shortfall} 家；{stopReason??action.errorMessage??"历史记录未保存结构化停止原因，请展开检查点核实。"}</p>}
    {partial&&['processing-incomplete','role-unresolved'].includes(String(action.result.targetCompletionReason))&&<ProcessingRecovery key={action.id} actionId={action.id} existingChild={typeof action.result.processingRecoveryChild==='string'?action.result.processingRecoveryChild:undefined}/>}
    {partial&&!['confirmed-exhaustion','no-qualified-progress','processing-incomplete'].includes(String(action.result.targetCompletionReason))&&Number(continuation?.depth??0)<3&&<SearchContinuation key={action.id} actionId={action.id}/>}
    <a href={marketHref(action.payload.countryCode,"leads")}>查看该国家候选库（含其他任务结果）</a>
    <details><summary>原始任务要求</summary><p style={{whiteSpace:"pre-wrap"}}>{action.payload.userRequest}</p></details>
  </section>;
}
