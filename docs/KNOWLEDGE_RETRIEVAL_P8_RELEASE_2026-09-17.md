# KQ01 P8 全面回归与发布交接

日期：2026-09-17

## 发布结论

P0–P8 的代码、迁移、离线评测、独立 LangGraph 路由、真实 PostgreSQL 检索与隔离式产品 UI 回归已完成。实现没有针对 WR3000 或任何单一型号写入答案；P8 的产品抽样改用 GS1010PE、LT700、WU650、RE1200，并分别覆盖交换机、蜂窝路由器、USB 适配器和中继器资料。

P8首次发布回归时，P3/P4 的 v2 语料代和事实代仍处于 validated/inactive；之后在KQ02/KQ03明确授权下完成10,871/10,871个向量，并在冻结评测200/200、知识/RAG 48项测试和TypeScript检查通过后原子切换为active。离线和本地快路径通过仍不等于复杂生成语义、真实供应商账单或用户采用已经通过。

## P8 实现

- 产品、公司、行业验证脚本默认离线且不调用 provider；只有显式 `--live` 才允许 embedding。断言改为语义主题、证据与非空语料，不再绑定固定文档数。
- 产品验证覆盖四个不同型号/类别；公司与行业各覆盖三个主题。三组共十个真实 SQL 检索检查全部命中，embedding 调用为 0。
- 独立 LangGraph 路由探测扩展到 `knowledge_workflow`，共四个 HTTP 请求：一个健康输出及 assistant、knowledge、lead 的预期 schema 拒绝；外部 provider 调用为 0。
- 新增 `knowledge:verify-ui` 隔离式登录验收。它在 1366×900 和 390×844 下执行文档直开、事实快答、Next.js→LangGraph→PostgreSQL→UI 刷新、页面横向溢出检查，并保存本地截图；同时核验原件有权访问为 200、缺失 asset 为 404、匿名访问为 401。
- 知识页原有 `span-12` 在未定义显式列的父网格中生成 12 个隐式列，曾把移动端 RAG 面板压成 0px。主题层现固定知识布局为一列、直接子项占满该列，并为窄屏引用与长文本增加收缩/换行约束。
- 属性注册表仍是通用规则，仅补充 PoE 输出口的空格/无空格中文别名；回归使用占位型号验证解析，不存入任何型号答案。
- 自动生成的线索工作流文档已同步到当前 v2.13.0 配置指纹；意图归因测试同步到实际 `assistant-intent-plan-v1.4`。

## 验收结果

| 检查 | 结果 |
|---|---|
| `npm.cmd test` | 222 files / 1,123 tests passed |
| `npm.cmd run typecheck` | passed |
| `npm.cmd run lint` | 0 errors；11 条既有 warning |
| `npm.cmd run build` | production build passed |
| `npm.cmd run test:browser` | 22 passed；2 desktop skips（仅移动端断言） |
| 全站 authenticated UI | 68/68 隔离检查通过；两视口；0 paid calls；0 real mail |
| `knowledge:verify-ui` | 两视口闭环通过；30 次热态本地快路径抽样；0 paid/external calls |
| `knowledge:eval` | 200/200 顶层知识路由；四个事实反例缺陷均未出现 |
| `knowledge:audit` | 283 active documents / 2,047 active chunks；3,054 legacy facts；0 external calls |
| 产品/公司/行业验证 | 4/4、3/3、3/3 语义/证据检查通过；0 embedding calls |
| LangGraph 配置/路由 | 四图注册通过；四个本地 HTTP 探测通过 |
| 工作流文档检查 | passed |

30 次热态样本只包含已验证的本地 `document-links` / `fact-answer` 分支，经过真实产品 API、独立 LangGraph 和 PostgreSQL。最终 P50 为 647.80 ms，P95 为 793.10 ms，最大 923.30 ms，达到“意图完成后本机热态 P95 ≤ 1 秒”的目标。该数字不包含浏览器首次登录、冷启动或复杂生成，不得外推为所有知识问答性能。

一次并行执行全量 Vitest 与浏览器套件使已有大用例超过 15 秒；该用例独立复跑 41/41 通过，全量串行复跑 1,123/1,123 通过，记为本地资源竞争而非产品失败。性能抽样第一次包含 LT700 的口语化 SIM 问法，它未进入快路径并被现有 `missing-budget` 门禁阻止，未产生付费调用；该样本从“已验证快路径性能集”移除，但保留为后续别名/事实覆盖优化项，不伪记为成功。

## 效率与剩余边界

P8 自动验收输入为 200 条冻结离线请求、十个真实 SQL 语义检查、30 个热态快路径请求、两视口知识闭环、68 个全站隔离检查、24 个浏览器项目用例和 1,123 个单元测试。有效输出分别为 200、10、30、2、68、22（另两项设计跳过）和 1,123；全部有效输出都用于发布门禁。模型、embedding、搜索、SMTP、provider token、API credit、现金费用、真实邮件和付费重试均为 0。实际用户采用仍未知。

复杂解释、现金账单、按语言/版本计算的 evidence Recall@8，以及 v2 active generation 的完整线上质量仍未知。向量构建的供应商累计延迟和token已记录，但不能代替查询/回答链路性能。下一步应先把 LT700 SIM 等候选口语映射纳入通用注册表和 verified fact 覆盖评测，再另行明确受控 `--live` 抽样的费用与外发范围；不得用扩大 top-k、跳过证据验证或自动付费重试替代这些门禁。
