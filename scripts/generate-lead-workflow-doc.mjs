import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const definitionPath = path.join(root, "config/lead-workflow/end-to-end-v2.0.0.json");
const scoringPath = path.join(root, "config/lead-scoring/policy-v2.0.0.json");
const costPath = path.join(root, "config/lead-workflow/cost-quality-policy-v3.0.0.json");
const runtimePath = path.join(root, "config/lead-workflow/runtime-policy-v3.0.0.json");
const defaultOutput = path.join(root, "docs/generated/LEAD_EVALUATION_WORKFLOW_V2.md");
const outputArg = process.argv.find((value) => value.startsWith("--output="));
const outputPath = outputArg ? path.resolve(outputArg.slice(9)) : defaultOutput;
const check = process.argv.includes("--check");
const [definition, scoring, cost, runtime] = await Promise.all([definitionPath, scoringPath, costPath, runtimePath]
  .map(async (file) => JSON.parse(await readFile(file, "utf8"))));

const hash = (value) => createHash("sha256").update(value).digest("hex");
const sourceFiles = [...new Set([...definition.sourceFiles,
  "config/lead-workflow/cost-quality-policy-v3.0.0.json",
  "config/lead-workflow/runtime-policy-v3.0.0.json",
  "src/lib/leads/workflow/evidence-budget.ts",
  "src/lib/leads/workflow/pdf-extraction-policy.ts",
  "src/lib/leads/workflow/public-evidence-repository.ts",
  "src/lib/leads/workflow/playbook-cache.ts",
  "src/lib/leads/workflow/assessment-cache.ts",
  "src/lib/leads/workflow/workflow-telemetry.ts",
  "src/providers/resilient-ai.ts",
  "experiments/multi-source-lead-discovery/scripts/score-v3-tool-lead-value.ts",
  "experiments/multi-source-lead-discovery/scripts/render-v3-tool-evaluation.ts",
  "experiments/multi-source-lead-discovery/scripts/verify-v3-tool-evaluation.ts",
  "db/migrations/029_isolated_user_long_term_memory.sql",
  "db/migrations/030_public_evidence_library.sql",
  "db/migrations/031_workflow_efficiency_telemetry.sql",
  "db/migrations/032_lead_assessment_cache.sql",
])];
const fingerprints = await Promise.all(sourceFiles.map(async (file) => ({
  file,
  sha256: hash(await readFile(path.join(root, file))),
})));
const configFingerprint = hash(JSON.stringify({ definition, scoring, cost, runtime }));
const list = (items) => items.map((item) => `- ${item}`).join("\n");
const lines = [
  `# Cudy 销售线索端到端工作流 v${runtime.version}`,
  "",
  "> 本文档由 `scripts/generate-lead-workflow-doc.mjs` 自动生成。请修改版本化配置或实现代码，不要直接编辑生成文件。",
  "",
  `- 运行时策略版本：${runtime.version}（基础流程定义 ${definition.version}）`,
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
  "意图识别每轮先调用轻量 Kimi 检查标准模板是否足够；仅在多市场、多目标、冲突约束或非标准复杂规划时升级 Kimi-k3。Lead 纠偏和评分以当前 DeepSeek 模型为主，只有预计改变总分至少 8 分或关键状态且高能力模型可解决时升级。主模型与升级模型相同则合并调用。最多允许两个显式批准、同级能力、同 Schema、同数据权限的跨公司 fallback；Embedding 不设置 fallback。",
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
  "## 五、当前评分标准",
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
  `- 优化目标：模型 token 再降 ${cost.qualityGates.targetTokenReductionPercent}%，付费搜索/提取额度至少降 ${cost.qualityGates.targetPaidSearchCreditReductionPercent}%。`,
  `- 证据预算：Limited ${cost.researchBudgets.limited.maximumTotalTokens}、Standard ${cost.researchBudgets.standard.maximumTotalTokens}、Deep ${cost.researchBudgets.deep.maximumTotalTokens} tokens。`,
  `- 二次引用：预计改变总分至少 ${cost.evidencePackets.secondCitation.minimumExpectedTotalScoreChange} 分或改变关键状态；仅提高少量置信度不允许。`,
  `- 主评分证据包：保留全部 finding 引用，另加最多 ${cost.evidencePackets.qualification.maxUnlinkedItems} 条上下文；单条摘录最多 ${cost.evidencePackets.qualification.maxExcerptCharacters} 字符。`,
  `- 主评分批次：最多 ${cost.evidencePackets.qualification.maxBatchInputCharacters} 个序列化输入字符，同时仍受单批公司数上限约束；超限自动拆批，单候选不可再拆时保留为独立批次。`,
  `- 独立复核证据包：保留全部 finding 引用，另加最多 ${cost.evidencePackets.independentReview.maxUnlinkedItems} 条上下文；单条摘录最多 ${cost.evidencePackets.independentReview.maxExcerptCharacters} 字符。`,
  `- 路径最多 ${runtime.cooperationPaths.maximumPerCompany} 条；通常显示 FitScore ≥${runtime.cooperationPaths.minimumDisplayedFitScore}，全部低于门槛时只显示最高一条；不输出路径 Confidence。`,
  `- Judge 总分差阈值：${cost.judgeRouting.totalScoreDifference}。`,
  `- 随机盲审比例：${cost.reviewRouting.randomAuditPercent}%。`,
  "- JSON Schema 只在最高优先级 system prompt 中发送一次，避免在 user prompt 重复整份结构定义。",
  "- 高并发只降低墙钟时间，不降低 token；真正的成本控制来自证据压缩、选择性复核、模型路由、缓存和单候选重试。",
  "- 标准 playbook 与已完成评分使用租户隔离的精确依赖缓存；全命中时不得发送空模型请求。证据内容/新鲜度、纠正事实、评分策略校验和、Prompt、任务目标或用户路径记忆变化时，仅重算受影响候选。",
  "",
  "## 七、质量门禁",
  "",
  ...Object.entries(cost.qualityGates).map(([key, value]) => `- ${key}: ${value}`),
  "",
  "任何成本优化必须在同一冻结证据快照上通过这些门禁，未通过时自动回退完整证据或高能力路径。",
  "正式产品不以 Top-N 作为升级依据；Top-N ≥90% 只用于离线搜索工具排行榜。代表性 A/B 每类只选 1–2 家，MAD 上限为 3 分，不自动全量重跑 207 家。",
  "",
  "## 八、离线工具搜索结果评测模式",
  "",
  "- 工具排行榜只消费冻结的搜索结果与证据快照，不追加搜索、不补充证据，也不生成合作路径、开发策略或开发信。",
  "- 模型只输出主角色、门禁语义判断、七项语义子分和精简证据说明；总分、状态归一化、工具映射与榜单聚合均由程序确定性完成。",
  "- 同一规范化公司只评分一次，再把结果映射回各搜索工具的候选出现记录，避免跨工具重复消耗模型 token。",
  "- 固定角色赛道容量、缺位记零及 Top-N 保留率只用于离线工具质量比较，不得成为正式产品的搜索停止、模型升级或候选淘汰依据。",
  "- 每次评测保存冻结输入指纹、禁止调用项、实际模型、token、请求次数、重试、有效输出、下游采用率和丢弃原因；发布前由程序清理无效证据引用并执行完整性门禁。",
  "",
  "## 九、搜索、网页与 PDF 获取策略",
  "",
  "- 已知官网 URL：先定向 Extract；Search 用于发现 URL，Extract/解析器用于读取正文，模型只看与当前缺口相关的片段。",
  "- Limited：Basic + raw content，最多 1 个查询组，不重复 Extract。Standard：Basic 不带 raw，提取 2–4 页。Deep：最多 3 个查询组，仅在实体冲突、复杂集团或 Basic 失败时用 Advanced；Crawl 仅限复杂站点且有边界。",
  `- PDF 先做价值门禁：≥${cost.searchAcquisition.pdf.preExtractionValueGate} 才提取，45–59 只抽样，低于 45 跳过；每次升级提取方式前重新评估价值。`,
  "- PDF 默认 pypdf；表格转 pdfplumber；扫描件仅对选定页用 Tesseract；仍有关键缺口时才对选定页使用高能力多模态模型。",
  "",
  "## 十、五类合作路径与流向",
  "",
  ...runtime.cooperationPaths.types.map((type) => `- ${type}`),
  "",
  "路径 FitScore 由模型给出五个语义子分、程序求和：角色/结构 30，用户阶段/供货 25，产品/客户/场景 20，采购/影响 15，执行可行性 10。角色与路径展示给用户且可修改；修改写入私有长期记忆，并与识别角色、候选路径一起输入后续开发策略和开发信 Agent。",
  "",
  "## 十一、知识、证据与长期记忆边界",
  "",
  "| 数据 | 存储范围 | 可影响评分 | 可影响策略/邮件 |",
  "|---|---|---:|---:|",
  "| Cudy 产品、场景、客户与竞品确认知识 | 共享知识库 | 是 | 是 |",
  "| 普通 Web/RAG 证据 | 独立 public_evidence 库及版本化快照 | 是；陈旧只提醒，不自动 invalid | 是，须在 handoff 允许范围内 |",
  "| 用户确认的工作区知识 | 用户/工作区私有库 | 按知识策略；营销措辞不作为公共事实 | 是 |",
  "| 用户合作路径修改 | 用户/工作区私有路径记忆 | 不直接改历史分数 | 是，影响未来路径推荐 |",
  "| 用户开发信修改 | 用户/工作区私有邮件风格记忆 | 否 | 是 |",
  "",
  "## 十二、成本与产出利用率遥测",
  "",
  "每个阶段记录输入/输出数量与字节、生成/有效/下游采用量、Token、实际模型、fallback、搜索额度和依赖指纹。事件生命周期为 generated、valid、retrieved、cited、decision-used、displayed、selected、edited、executed。系统只自动记录优化机会，不自动应用；私有正文、Prompt 和供应商原始响应不进入 GitHub 文档或聚合遥测。",
  "",
  "## 十三、实现文件指纹",
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
