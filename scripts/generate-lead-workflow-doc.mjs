import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const definitionPath = path.join(root, "config/lead-workflow/end-to-end-v2.0.0.json");
const scoringPath = path.join(root, "config/lead-scoring/policy-v2.0.0.json");
const costPath = path.join(root, "config/lead-workflow/cost-quality-policy-v2.0.0.json");
const defaultOutput = path.join(root, "docs/generated/LEAD_EVALUATION_WORKFLOW_V2.md");
const outputArg = process.argv.find((value) => value.startsWith("--output="));
const outputPath = outputArg ? path.resolve(outputArg.slice(9)) : defaultOutput;
const check = process.argv.includes("--check");
const [definition, scoring, cost] = await Promise.all([definitionPath, scoringPath, costPath]
  .map(async (file) => JSON.parse(await readFile(file, "utf8"))));

const hash = (value) => createHash("sha256").update(value).digest("hex");
const fingerprints = await Promise.all(definition.sourceFiles.map(async (file) => ({
  file,
  sha256: hash(await readFile(path.join(root, file))),
})));
const configFingerprint = hash(JSON.stringify({ definition, scoring, cost }));
const list = (items) => items.map((item) => `- ${item}`).join("\n");
const lines = [
  "# Cudy 销售线索端到端工作流 v2.0",
  "",
  "> 本文档由 `scripts/generate-lead-workflow-doc.mjs` 自动生成。请修改版本化配置或实现代码，不要直接编辑生成文件。",
  "",
  `- 工作流版本：${definition.version}`,
  `- 评分策略版本：${scoring.version}`,
  `- 成本质量策略版本：${cost.version}`,
  `- 配置指纹：\`${configFingerprint}\``,
  `- 范围：${definition.scope}`,
  "",
  "## 一、从用户输入到最终输出的总流程",
  "",
  "```mermaid",
  "flowchart TD",
  ...definition.stages.map((stage, index) => index === definition.stages.length - 1
    ? `  S${index + 1}[\"${stage.name}\"]`
    : `  S${index + 1}[\"${stage.name}\"] --> S${index + 2}`),
  "```",
  "",
  "最终输出不是单一分数，而是：证据约束下的公司身份与角色、评分、可能合作路径、账户等级、开发策略、开发信，以及用户修改后形成的私有长期学习信号。",
  "",
  "## 二、不可破坏的核心原则",
  "",
  list(definition.principles),
  "",
  "## 三、模型调用路由",
  "",
  "| 阶段 | 用途 | 默认模型 | 升级/回退 | 调用策略 |",
  "|---|---|---|---|---|",
  ...definition.modelRouting.map((route) => `| ${route.stages.map((stage) => `\`${stage}\``).join(", ")} | ${route.purpose} | ${route.defaultModel} | ${route.escalationOrFallback} | ${route.callPolicy} |`),
  "",
  "无生成模型阶段：多源搜索与网页抓取、研究深度确定性规则、证据包压缩、新鲜度校验、排行榜、账户等级、handoff 组装和持久化。",
  "",
  "## 四、逐步输入、输出与策略",
  "",
];

for (const [index, stage] of definition.stages.entries()) {
  lines.push(`### ${index + 1}. ${stage.name}`, "", `阶段 ID：\`${stage.id}\``, "", "输入：", "",
    list(stage.inputs), "", "输出：", "", list(stage.outputs), "", "策略：", "", list(stage.strategy), "",
    `失败与回退：${stage.failure}`, "", "流向下游：", "", list(stage.downstream), "");
}

const weights = scoring.weights;
const sub = scoring.subweights;
lines.push(
  "## 五、v2.0 评分标准",
  "",
  "| 一级维度 | 分值 | 细分规则 |",
  "|---|---:|---|",
  `| 产品与应用场景匹配 | ${weights.productAndUseCaseFit} | 产品家族 ${scoring.productAndUseCaseFit.productFamilyMatch}；客户与场景 ${scoring.productAndUseCaseFit.customerAndScenarioOverlap}；定位兼容 ${scoring.productAndUseCaseFit.positioningCompatibility} |`,
  `| 合作路径与采购影响力 | ${weights.cooperationPathAndBuyingInfluence} | 当前路径 ${sub.cooperationPathAndBuyingInfluence.currentPathFit}；采购控制 ${sub.cooperationPathAndBuyingInfluence.procurementControl}；选择/市场影响 ${sub.cooperationPathAndBuyingInfluence.selectionAndMarketInfluence} |`,
  `| 同主角色规模与覆盖 | ${weights.scaleAndChannelCoverage} | 相关业务规模 ${sub.scaleAndChannelCoverage.relevantBusinessScale}；市场覆盖 ${sub.scaleAndChannelCoverage.targetMarketCoverage}；渠道/客户网络 ${sub.scaleAndChannelCoverage.channelOrCustomerNetwork} |`,
  `| 执行与赋能 | ${weights.executionAndEnablement} | 商业运营 ${sub.executionAndEnablement.commercialAndOperationalExecution}；技术服务 ${sub.executionAndEnablement.technicalServiceAndEnablement}；市场激活 ${sub.executionAndEnablement.marketActivationAndContinuity} |`,
  `| 机会与风险 | ${weights.opportunityAndRisk} | 合作开放度 ${sub.opportunityAndRisk.partnershipOpenness}；时机 ${sub.opportunityAndRisk.strategicTiming}；竞争与结构风险 ${sub.opportunityAndRisk.competitionAndStructuralRisk} |`,
  "",
  `产品匹配方法：\`${scoring.productAndUseCaseFit.productFamilyMatchMethod}\`；未知证据规则：\`${scoring.productAndUseCaseFit.unknownEvidence}\`。规模只在相同主角色内横向比较。`,
  "",
  "## 六、成本控制参数",
  "",
  `- 主评分证据包：保留全部 finding 引用，另加最多 ${cost.evidencePackets.qualification.maxUnlinkedItems} 条上下文；单条摘录最多 ${cost.evidencePackets.qualification.maxExcerptCharacters} 字符。`,
  `- 主评分批次：最多 ${cost.evidencePackets.qualification.maxBatchInputCharacters} 个序列化输入字符，同时仍受单批公司数上限约束；超限自动拆批，单候选不可再拆时保留为独立批次。`,
  `- 独立复核证据包：保留全部 finding 引用，另加最多 ${cost.evidencePackets.independentReview.maxUnlinkedItems} 条上下文；单条摘录最多 ${cost.evidencePackets.independentReview.maxExcerptCharacters} 字符。`,
  `- 商业可行动分数阈值：${cost.reviewRouting.actionableScoreThreshold}。`,
  `- 多路径被视为实质接近的 fit 差：不超过 ${cost.reviewRouting.materialPathFitGap}。`,
  `- Judge 总分差阈值：${cost.judgeRouting.totalScoreDifference}。`,
  `- 随机盲审比例：${cost.reviewRouting.randomAuditPercent}%。`,
  "- JSON Schema 只在最高优先级 system prompt 中发送一次，避免在 user prompt 重复整份结构定义。",
  "- 高并发只降低墙钟时间，不降低 token；真正的成本控制来自证据压缩、选择性复核、模型路由、缓存和单候选重试。",
  "",
  "## 七、质量门禁",
  "",
  ...Object.entries(cost.qualityGates).map(([key, value]) => `- ${key}: ${value}`),
  "",
  "任何成本优化必须在同一冻结证据快照上通过这些门禁，未通过时自动回退完整证据或高能力路径。",
  "",
  "## 八、知识与长期记忆边界",
  "",
  "| 数据 | 存储范围 | 可影响评分 | 可影响策略/邮件 |",
  "|---|---|---:|---:|",
  "| Cudy 产品、场景、客户与竞品确认知识 | 共享知识库 | 是 | 是 |",
  "| 普通 Web/RAG 证据 | 当前运行证据快照 | 是，须满足新鲜度与引用规则 | 是，须在 handoff 允许范围内 |",
  "| 用户确认的工作区知识 | 用户/工作区私有库 | 按知识策略；营销措辞不作为公共事实 | 是 |",
  "| 用户合作路径修改 | 用户/工作区私有路径记忆 | 不直接改历史分数 | 是，影响未来路径推荐 |",
  "| 用户开发信修改 | 用户/工作区私有邮件风格记忆 | 否 | 是 |",
  "",
  "## 九、实现文件指纹",
  "",
  "以下指纹用于审阅代码是否发生变化。GitHub 自动同步任务会在相关实现或配置修改后重新生成本文档。",
  "",
  "| 文件 | SHA-256 |",
  "|---|---|",
  ...fingerprints.map((item) => `| \`${item.file}\` | \`${item.sha256}\` |`),
);
const generated = `${lines.join("\n")}\n`;

if (check) {
  const existing = await readFile(outputPath, "utf8").catch(() => "");
  if (existing !== generated) {
    console.error(`Workflow document is stale: ${path.relative(root, outputPath)}`);
    process.exit(1);
  }
} else {
  await writeFile(outputPath, generated, "utf8");
  console.log(JSON.stringify({ outputPath, workflowVersion: definition.version, configFingerprint }, null, 2));
}
