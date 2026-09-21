import { readFileSync, writeFileSync } from "node:fs";
import { productTools } from "../src/lib/assistant/main/tools";

const path = "docs/MAIN_AGENT_CAPABILITY_COVERAGE_MA11.md";
const pageOnly: Array<[string, string, string]> = [
  ["知识", "管理共享文档正文、二进制入库与发布", "`/api/knowledge/documents`, `/api/knowledge/uploads`；上传入口已在对话附件选择器，Agent 无审核后发布工具"],
  ["知识", "RAG 质量集审核与邮箱知识概览", "`/api/knowledge/evaluation-reviews`, `/api/knowledge/mailbox`；检索/事实工具不代替审核"],
  ["联系人", "查询最近一次联系人补全运行", "`/api/contact-enrichment/runs/latest`；发现与保存用 `contacts_lookup`"],
  ["开发信", "对已有策略提交人工反馈并再生成", "`/api/development-strategies/[id]/feedback`；直接生成和版本化编辑可调用"],
  ["邮箱", "创建、更新、删除邮箱连接", "`/api/mailbox/connections`；连接列表和同步可调用，凭证不得进入模型上下文"],
  ["邮箱", "邮件本地筛选、学习决定及消息生命周期", "`/api/mailbox/screening`, `/api/mailbox/messages/[id]/learning`, `/api/mailbox/messages/[id]`"],
  ["任务", "对未知外发或旧任务执行人工对账", "`/api/tasks/[id]/reconcile`；`task_detail`/`run_read` 只读回执"],
  ["管理", "更改旧预算参考值", "`/api/budget` PUT；`budget_read` 只读，MA05 观察模式仍保留旧页面"],
];
const missing: Array<[string, string]> = [
  ["正式评分发布", "独立 `company_score` 只存研究产物；原完整工作流可排队，单项正式发布尚无 Agent 工具"],
  ["独立联系人核验", "`contacts_lookup` 可发现/保存；独立验证与归属决定尚无 Agent 工具"],
  ["未关联公司邮件的跟进草稿", "`follow_up_generate` 明确返回缺少公司上下文，不伪造归属"],
  ["MCP/API 连接、联网浏览器、私有 Git 连接", "MA11 后续阶段；当前注册工具不声称这些连接可用"],
];

const lines = [
  "# MA11 主 Agent 能力覆盖核对",
  "",
  "本表从可执行工具注册表生成。基线为原有 74 项；`lead_workflow` 是本轮新增的第 75 项。`可调用`只表示工具有注册的 schema、账户/角色门禁和服务适配器，不代表外部连接可用、业务结果已生成或真实模型已选中。具体用途见 [工具目录](MAIN_AGENT_TOOL_CATALOG.md)。",
  "",
  "| 工具 | 状态 | 角色 | 效果 | 费用状态 |",
  "|---|---|---|---|---|",
  ...productTools.map(tool => `| \`${tool.id}\` | 可调用 | ${tool.role} | ${tool.effect} | ${tool.cost} |`),
  "",
  "## 当前仅页面可用的已存在动作",
  "",
  "| 领域 | 动作 | 页面入口与 Agent 差距 |",
  "|---|---|---|",
  ...pageOnly.map(row => `| ${row.join(" | ")} |`),
  "",
  "## 缺实现或明确后续阶段",
  "",
  "| 能力 | 当前边界 |",
  "|---|---|",
  ...missing.map(row => `| ${row.join(" | ")} |`),
  "",
  "发布、外发及重要删除仍以实际工具效果触发精确批准。管理员工具只有当前角色为管理员时才可执行。每项返回的数据、缺项、连接状态及真实回执须分别验收；本盘点本身不是 120 条回放或 8 条真实 GLM Batch 的证据。",
  "",
].join("\n");
if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8") !== lines) throw new Error(`${path} is stale; regenerate coverage`);
} else writeFileSync(path, lines);
console.log(JSON.stringify({ registered: productTools.length, pageOnly: pageOnly.length, missing: missing.length, checked: process.argv.includes("--check") }));
