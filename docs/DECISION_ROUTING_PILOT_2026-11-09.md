# 独立决策路由试点

## 用户确认与范围

HYBRID-02：用户在 Jev 1.14 首轮试点、OpenAI Decisions 对照、保留主回答模型的建议后确认“好的，按照你的建议进行”。模型固定为 `typesafe/jev-1.14` 和 `openai/gpt-6-luna-decisions`，使用现有 OpenRouter 账户。没有确认改用浮动 latest、自动双路由串联或替换主回答模型。

## 实现

- 新增独立 `/api/alpha/decisions` 适配器，不把模型名称塞进 Chat Completions。服务端发送单个固定 Choice 问题和最多 6,000 字符的原始请求，不截断用户需求；固定四个输出：`fixed_workflow`、`dynamic_agent`、`interpreter`、`uncertain`。
- 工程开关 `HYBRID_DECISION_MODE=off|shadow|advisory`，默认 off。shadow 只保存决策收据；advisory 向原主模型提供可推翻的枚举建议，不直接执行工具。`HYBRID_DECISION_MODEL` 默认 Jev 固定版本，可显式选择 OpenAI Decisions；无自动模型级联。
- 已命中确定性固定流程的请求跳过决策 API。初期只接收无历史、附件、知识集合限制、有效决策记忆和补充指令的初始请求；其他请求保留原动态规划。没有把缺失的上下文裁掉后交给小模型判断。后续扩大覆盖需另行验证。
- 原主模型、权限、工具白名单、引用、搜索/评分策略不变。interpreter 仍仅允许既有本地只读工具，不能执行外部搜索、评分、写入或发送。决策模型不决定公司身份、不生成工具参数或脚本。
- 每个任务最多一次决策请求，2,500 毫秒请求截止，无 SDK 重试；超时、错误、低确定性或 uncertain 回退原动态规划。高概率不是准确率，暂用 top probability >=0.9 且第一、第二概率差 >=0.2，属于待校准工程参数。
- 原始问题始终保留；补充指令/政策修订使旧建议失效。开始/完成收据使用现有任务持久化机制；恢复复用完成结果，started/unknown/失败收据不重发。保存完成收据失败不会伪装为成功。未知决策调用不产生工具业务副作用，仍可继续主模型，未知费用单独保留。
- 普通产品入口经过现有预算、请求指纹、usage/费用观察机制。文本、单题、固定选项、禁止数据收集和自动提供商回退均做服务端校验，MA05 财务观察模式不能绕过这些约束。费率参考截至 2026-11-09，七日有效期；不把普通 usage 自动升级成已核对账单。CLI 合成试验采用独立本地调用收据，不写入用户业务任务。

## 首轮真实接口对照

128 条合成题来自 16 个模板家族，开发集 64 条、按模板家族隔离的保留集 64 条。标签由开发者预设，不是用户自然业务、人工独立标注 Gold 或完整任务验收。首次沙箱内 Jev 请求未获响应，保留 unknown；只读网络探测返回 EACCES，获准的沙箱外只读探测返回 HTTP 200。未重发首题。两模型共同对照后续相同的 127 条题，模型版本、提示、阈值在此轮保持不变。

| 指标 | Jev 1.14 | OpenAI Decisions |
| --- | --- | --- |
| 完成共同样本 | 127/127 | 127/127 |
| 原始分类与预设标签一致 | 118/127 | 121/127 |
| 保留集标签一致 | 60/64 | 59/64 |
| 请求 P95（本机、含网络） | 499 ms | 760 ms |
| 阈值后固定流程建议 | 0 | 2 |
| 阈值后 interpreter 建议 | 18 | 3 |
| 阈值后动态规划 | 109 | 122 |
| 非固定类被建议固定流程 | 0 | 0 |

**零误放不能单独证明路由有效：Jev 在当前门槛下没有放入固定流程，OpenAI 也仅两条。** 因此保持默认关闭，保留 Jev 为试点首选，不宣称它已经节省端到端时间或费用，也不根据总标签一致数宣布 OpenAI 更适合业务。advisory 不跳过主模型，它验证的是接入与建议质量。

当前生效版本未切换，本轮不重启已有产品、不修改本地运行环境、不接触真实邮件或发信。离线阈值校准需使用开发样本；之后应冻结参数并建立新的未见业务样本，不能将已经查看的本轮保留集重新宣传为独立最终验收。

## 验证与复现

- `node scripts/run-tsx.cjs scripts/evaluate-decision-routing.ts`：只检查样本及契约，不调用模型。
- `--live --model=typesafe/jev-1.14 --offset=1 --limit=127`：限定窗口调用。另一个模型可显式替换；已完成结果复用，不完整记录阻止同一题重发，改提示或样本身份也阻止复用。
- `node scripts/run-tsx.cjs scripts/report-decision-routing.ts`：只读核验两组已有收据、契约哈希及响应，重新生成共同样本对照，无付费调用。
- 本地原始收据保留于 `.local-runtime/decision-routing-eval-20261109/`；受版本控制的证据仅记录聚合和哈希，不提交密钥、环境配置、内部用户标识。
- 工程验证、候选构建及限制见 [本轮证据](evidence/decision-routing-pilot-2026-11-09.json)。恢复测试目前为模拟收据，未声明实际数据库故障恢复验收。

后续未完成：按实际业务误分流代价校准阈值、建立自然业务新样本、验证政策/连续对话的最小上下文方案、对照完整任务的需求覆盖/引用/耗时/总调用成本、候选发布后的小范围 shadow/advisory 验收。G14–G20 和互联网部署未推进。

接口依据：[OpenRouter Decisions 请求契约](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request)、[Jev 文档](https://openrouter.ai/docs/guides/community/jev)、[OpenAI Decisions 官方说明](https://developers.openai.com/api/docs/guides/decisions)。
