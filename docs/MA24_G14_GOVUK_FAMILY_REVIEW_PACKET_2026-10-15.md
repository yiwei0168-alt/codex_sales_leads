# MA24 G14 GOV.UK 工作簿家族审核包

状态：**用户已确认跨文档题的答案和因果限定、无答案题的资料不足限定；两题保留为私有待冻结 Gold 候选，尚非批准 Gold。** 两份工作簿形成一个共享暴露单元：BDUK 单来源题、跨文档题和 Taking Part 无答案题必须一起冻结、审计和分组，不能以三题数冒充三个独立来源家族。[逐题确认 MA24-21](CONFIRMED_PRODUCT_RULES.md)、[回复收据](evidence/ma24-g14-govuk-two-case-answer-review-2026-10-15.json)。G17–G20 暂停。

逐题原格核查已形成 [v2 私有草稿收据](evidence/ma24-g14-govuk-per-case-source-review-2026-10-15.json)：三题的来源摘录分别由 2、4、2 条修订为 3、6、2 条，并把关键数字格与标签一并写入摘录。旧 v1 草稿保留。随后对 Taking Part 原工作簿做了[结构级逐题补审](evidence/ma24-g14-govuk-structural-per-case-review-2026-10-15.json)：四张可见表中无隐藏行列、公式、数据透视表或外部链接，目标区域和年龄行及产品抽取坐标吻合。此次确认三题的来源内容可进入后续审核，未批准 Gold，也未证明全套来源独立或用户可见引用质量。

## A. 跨文档比较与因果边界

题目 ID：`govuk-bduk-taking-part-premises-vs-regional-ability`。题目要求从 [BDUK 2018 官方发布](https://www.gov.uk/government/statistics/broadband-performance-indicator-march-2018) 与 [Taking Part 2019/20 官方发布](https://www.gov.uk/government/statistics/taking-part-201920-internet) 报出可用房产数、伦敦与东北部成人自评互联网能力比例及百分点差，并判断两本工作簿能否证明前者造成后者的地区差异。

候选答案：BDUK `Sheet1!B26` 为截至 2018 年 3 月累计 **4,852,808 处**，其 `A28` 限定为 BDUK 支持项目的干预区、达到超高速门槛的可用房产，`A32` 解释累计口径。Taking Part 的 `Table 2!C28` 伦敦为 **80.3%**，`Table 2!C22` 东北部为 **74.0%**，差为 **6.3 个百分点**；`B2` 定义 2019/20 年英格兰受访成人的自评能力，`C5` 为百分比单位。两个指标的时间、群体和含义不同，工作簿未把 BDUK 房产与 Taking Part 受访者相连，不能据此认定因果关系。

产品抽取对应 BDUK `sheet-1-table` 第 26/28 行、Taking Part `sheet-3-table` 第 22/28 行；两份原件 SHA-256 分别为 `7d178716b667ebe66537154b0bb96f87348ccb782368b2f43920b45db9f7f5c1` 与 `90eb0ed392efc2db8ab6681bcf4b9634c41f891d3df7a95bba3bf6f9457ff614`。隔离克隆的双文档登记、读取和跨账号拒读已有收据；真实用户可见双来源回答与引用尚未验收。

## B. 无答案交叉组

题目 ID：`taking-part-2019-20-rural-age75-intersection-unavailable`。题目要求从 Taking Part 工作簿给出“英格兰农村且 75 岁以上成人”自评互联网能力至少 7 分的**精确合并组比例**。

候选答案：**该工作簿没有报告这个交叉组比例。** `Table 2!B33/C33` 的 **75.6%** 是所有农村成人的比例；`Table 3!B15/C15` 的 **33.1%** 是所有 75 岁以上成人的比例。四张表中没有该交叉组行；两个边际比例无法推出合并组比例。预期行为是说明资料不足并引用已检查的两处分组，不能猜出一个精确数字，也不能把两个数字相乘当作答案。产品坐标分别为 `sheet-3-table` 第 33 行、`sheet-4-table` 第 15 行。

## 家族与审核边界

- 当前 v6 题池中同一暴露单元还有 `bpi-2018-cash-accruals`，它询问支出现金/权责口径比值 **7,934 / 7,617**。跨文档题改问累计可用房产 **4,852,808**，但仍复用 BDUK `Sheet1` 的同一月份与指标背景；无答案题又复用 Taking Part 的 Table 2。三题应一起做来源与答案泄漏审计、冻结及分组报告。
- 本轮重读原件：BDUK `Sheet1!B26/A28/A32/A33`，Taking Part `Table 2!B2/C5/B22/C22/B28/C28/B33/C33`、`Table 3!B15/C15`，并扫描全部四张表及工作簿结构。数值、口径和页/表范围与先前产品抽取收据一致。区域和年龄分别列在 Table 2 与 Table 3；没有联合分组行、列、隐藏表或数据透视结果。Table 3 标题末尾虽误带“area-level breakdowns”，但实际包含 Age 分组；审核以行内容为准。这里只支持“该工作簿未报告交叉组”，不能扩大为外部世界没有该数据。
- 两份官方发布页均列出原 XLSX。当前有界来源用途审核仅支持带归属的短事实与内部题目，不批准整件再分发或封面徽标使用；当前本地/历史定向筛查不能排除未记录提示或提供方侧暴露。
- 当前 v6 的 27 条候选已用固定版本的本地 BGE 全池复筛并逐条读题，GOV.UK 三题的最近邻仍是共用原件的彼此；FCC/ONS 题在分母和比较口径上相近，但没有提供本组三题所需的原表数字或同一联合组答案。[整池复筛收据](evidence/ma24-g14-current-27-pool-overlap-review-2026-10-15.json)只覆盖当前候选题文，不取代历史全部提示、检索内容及派生资料的污染终审。
- 在首份 BDUK 候选登记前的固定 Git 树中，对 `docs/scripts/src/experiments` 的工作簿名、发布 URL 和关键数字做不区分大小写的精确筛查，未命中；旧 350 行题目近邻也未见本组特定问题。[登记前暴露补审](evidence/ma24-g14-govuk-preintroduction-exposure-screen-2026-10-15.json)仍未覆盖未入库对话、二进制、提供方侧记录和派生资料，因此只提高本地排查覆盖，不批准来源独立性。
- 这两种题分别属于**跨文档统计口径/因果边界**与**交叉组无答案**，不在此前五类设备题按类型自动采纳的授权范围。用户已分别确认上述候选答案与限定，继续保留为待冻结候选；`bpi-2018-cash-accruals` 尚未得到此次逐题回复。全套独立性终审、冻结 Gold、G15 运行准入与 G16 真实双路质量均未完成；批准 Gold 仍为 **0**。

下一步对这一共享暴露单元做整套来源和答案泄漏审核，再逐题决定是否批准 Gold。若题面/答案改变，先更新私有草案、重核原格与题池重叠，再冻结哈希。检查收据：[GOV.UK 家族审核准备](evidence/ma24-g14-govuk-family-review-packet-2026-10-15.json)、[逐题原格核查](evidence/ma24-g14-govuk-per-case-source-review-2026-10-15.json)、[结构级逐题补审](evidence/ma24-g14-govuk-structural-per-case-review-2026-10-15.json)。

## 本机会话暴露时间边界补核（2026-10-15）

首份 BDUK 候选的 Git 登记时间为 03:22:10 UTC。本机 94 份 Codex 会话记录、152,834 条 JSONL 记录的精确名称、发布 URL 与答案数值筛查显示：登记前的命中仅见于当日 03:14:17–03:21:57 UTC 的候选准备窗口，未在更早记录中命中。因而，登记前 Git 树零命中不能写成“登记前完全未暴露”；这些同轮准备记录也不足以证明更早产品开发已用过这两份工作簿。重复的工具调用和输出不计成多个独立来源。精确筛查仍可能漏掉改写说法、未记录提示、二进制内容和提供方记录；家族来源资格与 Gold 冻结继续待审。[时间边界收据](evidence/ma24-g14-govuk-local-rollout-exposure-boundary-2026-10-15.json)。
