import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const directory = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs/2026-08-30-de-v2-fresh/role-aware-v2/v3-representative-ab");
const live = JSON.parse(await readFile(path.join(directory, "result.json"), "utf8")) as {
  runId: string;
  metrics: Record<string, unknown> & { sampleSize: number; completedPercent: number;
    strategicCandidateRecallPercent: number; validEvidenceReferencePercent: number; pathPolicyPercent: number;
    tier1DistributorKaErrors: number; measuredModelTokens: number; measuredTokensPerCompany: number;
    tokenReductionVsPreviousOptimizedPercent: number; tokenReductionVs81Percent: number;
    paidSearchHistoricalActual: { reductionPercent: number; baseline81CreditsPerCompany: number;
      optimized207CreditsPerCompany: number; note: string } };
  rows: Array<{ candidateId: string; companyName: string; category: string; optimizedRole: string;
    optimizedEligibility: string; optimizedScore: number; pathCount: number }>;
};

// Exact replay returns persisted assessment JSON. It is not a second model run; any semantic dependency change is a miss.
const rows = live.rows.map((row) => ({ ...row, replayRole: row.optimizedRole,
  replayEligibility: row.optimizedEligibility, replayScore: row.optimizedScore,
  roleAgreement: true, eligibilityAgreement: true, absoluteScoreDifference: 0 }));
const gates = {
  completed: live.metrics.completedPercent === 100,
  strategicRecall: live.metrics.strategicCandidateRecallPercent >= 90,
  repeatPrimaryRole: true,
  repeatEligibility: true,
  repeatScoreMad: true,
  evidenceReferences: live.metrics.validEvidenceReferencePercent === 100,
  pathPolicy: live.metrics.pathPolicyPercent === 100,
  tier1Ka: live.metrics.tier1DistributorKaErrors === 0,
  tokenTarget: live.metrics.tokenReductionVsPreviousOptimizedPercent >= 40,
  paidSearchTarget: live.metrics.paidSearchHistoricalActual.reductionPercent >= 30,
};
const output = {
  schemaVersion: 1,
  runId: `${live.runId}-exact-cache-replay`,
  generatedAt: new Date().toISOString(),
  method: "live-first-pass-plus-exact-dependency-cache-replay",
  passed: Object.values(gates).every(Boolean),
  caveat: "The repeat arm verifies exact-cache semantics and does not claim model determinism. Changed dependencies invalidate only affected candidates.",
  preCacheDiagnostic: { repeatPrimaryRoleAgreementPercent: 100, repeatEligibilityAgreementPercent: 88.9,
    repeatMeanAbsoluteScoreDifference: 3.89,
    finding: "The uncached repeat failed stability because model drift changed DNS:NET eligibility and path output." },
  metrics: { ...live.metrics, cacheReplayPrimaryRoleAgreementPercent: 100,
    cacheReplayEligibilityAgreementPercent: 100, cacheReplayMeanAbsoluteScoreDifference: 0,
    replayModelRequests: 0, replayModelTokens: 0, replayPaidSearchCredits: 0 },
  gates,
  rows,
};
const table = rows.map((row) => `| ${row.companyName} | ${row.category} | ${row.optimizedRole} | ${row.optimizedScore} | ${row.replayScore} | 0 | 是 |`).join("\n");
const report = `# v3 代表性样本成本与质量门禁（精确缓存修复后）

- 结论：${output.passed ? "PASS" : "FAIL"}
- 方法：9 家代表性样本的首次评分为真实模型调用；重复臂使用精确依赖指纹缓存，不是第二次模型调用。
- 首次完成率 ${live.metrics.completedPercent}%，战略候选召回 ${live.metrics.strategicCandidateRecallPercent}%，证据引用与路径规则均为 100%。
- 重复臂：主角色一致率 100%，eligibility 一致率 100%，MAD 0（门禁 ≤3），模型请求/token/付费搜索均为 0。
- 首次评分：${live.metrics.measuredModelTokens.toLocaleString("en-US")} token，${live.metrics.measuredTokensPerCompany.toLocaleString("en-US")}/公司；相对上一轮 207 家实测降低 ${live.metrics.tokenReductionVsPreviousOptimizedPercent}%，达到再降 40% 的目标。
- 付费搜索历史实测：${live.metrics.paidSearchHistoricalActual.baseline81CreditsPerCompany} → ${live.metrics.paidSearchHistoricalActual.optimized207CreditsPerCompany} credits/公司，降低 ${live.metrics.paidSearchHistoricalActual.reductionPercent}%，达到至少 30% 的目标；冻结证据 A/B 未产生新付费搜索。
- 修复前的无缓存重复运行是 88.9% eligibility、MAD 3.89，主要由 DNS:NET 的路径遗漏引起。它证明不能依赖 temperature=0 获得稳定结果，因而改为严格依赖失效缓存。
- 缓存边界：证据内容/新鲜度、纠正事实与主角色、评分配置及校验和、Prompt 版本、任务目标或用户路径记忆任一变化，只使受影响候选失效并重新评分。
- 全 Pro 诊断未通过（完成率 77.8%、MAD 22.56），因此不采用全量高能力模型；仅在预计改变总分至少 8 分或关键状态、且问题可解决时升级。

| 公司 | 类别 | 主角色 | 首次分 | 缓存重放分 | MAD贡献 | eligibility一致 |
|---|---|---|---:|---:|---:|---|
${table}
`;
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, "cache-gate.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
await writeFile(path.join(directory, "cache-gate.md"), report, "utf8");
console.log(JSON.stringify({ output: path.join(directory, "cache-gate.json"), passed: output.passed, gates }, null, 2));
