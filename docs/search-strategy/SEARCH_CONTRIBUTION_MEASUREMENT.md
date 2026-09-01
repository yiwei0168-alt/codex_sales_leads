# 真实搜索贡献与下游质量测量规范

版本：`1.0.0`

适用策略：`0.5.0-discussion`及后续版本

## 一、目的

每次真实搜索都要回答四个问题：

1. 每个工具实际发现了多少新的、有效的唯一公司？
2. 这些公司经过补证、角色识别和评分后真实质量如何？
3. 哪些搜索或中间输出最终没有被下游使用，为什么？
4. 在不降低质量的前提下，哪个调用、查询、模型或提取步骤可以停止、缓存、替换或降级？

## 二、绑定信息

每个运行必须保存：

- `run_id`、workspace/market的非个人化标识
- `strategy_version`、搜索计划指纹、查询模板版本
- 用户目标类别、地区、产品/场景约束和目标数量
- provider、底层搜索引擎、检索机制和调用理由
- 是否为核心调用、缺口触发、fallback或用户显式要求
- 输入候选库/公共证据库快照指纹
- 实际模型、Prompt版本和评分策略版本

## 三、统一事件流

```text
search-returned
→ identity-normalized
→ deduplicated
→ gate-pass/hold/reject
→ evidence-reused/acquired
→ role-resolved/unresolved
→ scored/invalid
→ displayed
→ selected/edited/executed
```

每个事件包含`candidate_id`、`provider_occurrence_id`、时间、阶段、结果、reason code和依赖指纹。正文不进入聚合遥测。

## 四、每个搜索调用必须记录

| 指标 | 定义 |
|---|---|
| input_queries | 实际查询数量及序列化字符数 |
| raw_results | provider返回的原始记录数 |
| normalized_company_results | 可以映射到公司实体的记录数 |
| new_unique_companies | 相对实时候选注册表首次新增的公司数 |
| existing_company_hits | 已存在公司命中数 |
| duplicate_within_call | 同一调用内部重复数 |
| gate_pass / hold / reject | 轻量门禁结果 |
| paid_search_credits | 实际API credits或请求成本 |
| model_input/output_tokens | 搜索规划或门禁模型token |
| latency_ms | 调用及阶段墙钟时间 |
| retries / fallback | 重试次数、替代provider和原因 |
| discarded_reason_counts | invalid URL、无关实体、重复、无目标市场、无官网等 |

## 五、provider贡献归因

同一公司可能被多个工具发现，不能只用“最先发现”奖励第一个provider，也不能给所有provider各计一个完整唯一候选。每次运行同时报告四种贡献：

1. 首次发现贡献：谁最先把公司写入实时注册表。
2. 独有贡献：运行结束时只被一个provider发现的公司。
3. 辅助发现贡献：参与发现同一公司的所有provider。
4. 分数化贡献：一家公司被`n`个provider独立发现时，每个provider获得`1/n`发现信用；所有provider信用总和等于唯一公司数。

对于动态串行策略，还要记录`opportunity_set`：某provider未被调用不能视为未发现能力；只有实际获得相同任务机会的provider才能用于直接A/B比较。

## 六、下游真实质量回写

补证和评分完成后，将以下结果映射回该公司的所有provider occurrence：

- 最终公司实体是否有效
- 最终主角色及是否匹配本次目标类别
- `eligible`、`research-required`或`invalid`
- 七项语义子分和确定性总分
- 最终引用证据数量、官网证据数量和引用有效率
- 是否需要新增搜索、Extract、PDF或高能力模型
- 是否进入用户可见候选库
- 是否被用户选择、修改、开发或长期保留

provider质量不使用其自身rank或摘要评分，而使用统一下游结果。

## 七、核心质量指标

| 指标 | 计算方法 |
|---|---|
| unique_valid_yield | 新增有效唯一公司 / 原始结果 |
| target_role_yield | 最终主角色符合目标的唯一公司 / 规范化公司 |
| evidence_ready_yield | 达到评分证据门槛的唯一公司 / 门禁pass+hold |
| eligible_yield | eligible唯一公司 / 规范化公司 |
| downstream_use_rate | 被展示、选择或执行的唯一公司 / 有效唯一公司 |
| unique_high_value_count | 仅由该provider发现且超过类别质量阈值的公司数 |
| score_weighted_credit | 分数化发现信用乘以公司最终统一分数 |
| evidence_contribution_rate | provider来源页面最终被引用的数量 / 其可验证页面数 |
| duplicate_waste_rate | 已存在和调用内重复结果 / 原始结果 |
| cost_per_valid_company | 搜索+门禁+归属补证成本 / 有效唯一公司 |
| cost_per_used_company | 总归属成本 / 最终下游采用公司 |

质量阈值用于离线分析，不成为正式产品Top-N升级触发器。不同角色分别统计，不能把Distributor规模或分数直接与地方Installer横向比较。

## 八、成本归属

每家公司记录边际成本和共享成本：

- 搜索请求/API credit
- 搜索规划模型输入/输出token
- 轻量门禁token
- 官网直接抓取字节和延迟
- Tavily Search/Extract credits
- PDF抽样、解析或OCR成本
- 事实/角色模型token
- 评分模型token
- 失败、重试和fallback成本

批量调用成本按候选序列化输入字符或实际token比例分摊；公共证据缓存命中记录为`reused`并估算避免的重复成本，但不能伪造现金节省。

## 九、丢弃原因标准码

- `duplicate-existing-company`
- `duplicate-same-call`
- `branch-merged-to-parent`
- `invalid-or-non-company`
- `wrong-market`
- `wrong-role-family`
- `unrelated-product-or-scenario`
- `consumer-only-for-b2b-task`
- `marketplace-no-procurement-control`
- `closed-or-inactive`
- `identity-conflict`
- `insufficient-public-evidence`
- `held-limited-research-exhausted`
- `provider-error`
- `schema-error`
- `budget-stop`
- `marginal-value-stop`

新增reason code必须版本化，不能使用无法聚合的自由文本代替。

## 十、双轨实时反馈测量

对于Reseller和SI/MSP等双轨任务，每批记录：

- 批次开始时已有公司数和排除域名数
- 另一轨道新增后被本轨道避免的任务数
- 跨轨重复命中数
- 因共享候选注册表而避免的补证、门禁和评分调用数
- 每轨对地区、客户类型、子角色和证据缺口的净填补量
- 同步等待时间及其是否减少总重复成本

搜索引擎无法保证不返回已有公司，因此“避免重复”的质量门禁是：不得产生第二个公司记录、第二个并发补证任务或第二次统一评分，而不是要求provider原始结果重复率为零。

## 十一、真实测评报告最低内容

每次正式报告至少包含：

1. 策略版本、输入指纹、市场、类别和目标数量。
2. 每个provider的实际调用理由、查询批次、请求数、成本和延迟。
3. 原始结果、规范化公司、新增唯一公司、重复和门禁结果漏斗。
4. 独有、首次、辅助和分数化贡献。
5. 补证后证据可用率、最终角色、状态和统一分数分布。
6. 用户可见、选择和后续采用率；尚未发生的用户行为标记为`not-observed`。
7. 每个有效/采用候选的真实成本。
8. 停止原因、无效输出原因和下一版可验证优化建议。
9. 与上一策略版本的同口径对比；非同口径数据必须明确标注。

## 十二、GitHub与数据库边界

数据库保存逐调用、逐候选和逐证据事件，支持相同地区和类型的后续复用。GitHub文档只记录：

- 聚合数量和比率
- 无密钥的策略和Schema版本
- 质量门禁结果
- 成本与利用率
- 丢弃原因分布
- 已确认优化机会和版本变更

用户私有搜索意图、长期记忆、联系人、邮件、原始页面正文和供应商原始响应不得进入GitHub聚合文档。
