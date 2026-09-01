# 多源搜索工具结果测评 v3.0

- 运行：`2026-08-30-de-v3-tools-frozen-v2`
- 冻结输入：`2026-08-30-de-v2-tools-full` 的 207 家唯一公司、253 条工具候选记录及原有证据
- 本轮新增搜索/证据：0 / 0
- 本轮合作路径、开发策略、开发信：0 / 0 / 0
- 评分：产品与场景 50，采购/选择影响力 15，同主角色规模与覆盖 15，执行赋能 10，机会风险 10；总分由程序确定性求和

## 工具排行榜

| 排名 | 工具 | v3总分 | v2排名 | 排名变化 | 一级分销 | 转售/零售 | 项目服务 | 有效候选率 |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | product-google-places-local | 76.03 | 1 | 0 | 78.7 | 71.4 | 78 | 79.2% |
| 2 | gemini-full | 54.87 | 2 | 0 | 84.5 | 10 | 70.1 | 95.5% |
| 3 | product-tavily | 54 | 3 | 0 | 76.6 | 28.3 | 57.1 | 95.7% |
| 4 | product-gemini | 50.23 | 4 | 0 | 70.6 | 26.5 | 53.6 | 100% |
| 5 | product-searchapi | 48.1 | 5 | 0 | 70.8 | 14.3 | 59.2 | 100% |
| 6 | product-brave | 46.23 | 6 | 0 | 64.5 | 16.5 | 57.7 | 100% |
| 7 | product-exa | 43.7 | 7 | 0 | 78 | 8.6 | 44.5 | 94.4% |
| 8 | product-google-places | 6.37 | 8 | 0 | 0 | 0 | 19.1 | 75% |

每个角色通道固定 10 个槽位，缺位按 0 分。工具总分为三个角色通道的宏平均；只评工具找到的公司价值，不计工具价格、速度或文本丰富度。

## 重点公司校验

| 公司 | 主角色 | v3 | 产品/场景50 | 采购影响15 | 规模覆盖15 | 执行10 | 机会风险10 | v2 | 同角色排名 | 状态 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Ingram Micro Distribution GmbH | Distributor | 100 | 50 | 15 | 15 | 10 | 10 | 82 | 1 | eligible |
| TD SYNNEX Germany GmbH & Co. OHG | Distributor | 83 | 40 | 12 | 14 | 9 | 8 | 82 | 10 | eligible |
| ALSO Deutschland GmbH | Distributor | 100 | 50 | 15 | 15 | 10 | 10 | 73 | 3 | eligible |
| Herweck AG | Distributor | 80 | 40 | 12 | 12 | 8 | 8 | 75 | 18 | eligible |
| Wave Computersysteme GmbH | Distributor | 77 | 40 | 12 | 10 | 7 | 8 | 73 | 27 | eligible |
| ECOM Electronic Components Trading GmbH | Distributor | 60 | 30 | 8 | 10 | 6 | 6 | 65 | 47 | research-required |

这些公司没有因为 broadline 业务复杂而被稀释，也没有因为专注 SMB 而被扣除其他产品轨道的缺失；规模只在其主角色内比较。

## 质量与成本审计

- 完成评分：207/207；最终发布证据 ID 有效率：100%；模型原始引用合规率 99.5%，1 个无效 ID 已被程序删除；未解析主角色：13。
- v2→v3 公司分数 MAD 9.08、中位绝对差 7；这是评分机制变化的敏感性诊断，不是稳定性失败。
- 分数分布：P10=2，P25=56，中位数=72，P75=77，P90=80，满分公司=5。
- 模型请求 105 次，实际 token 1,275,467，6,162/公司；模型调用分布：deepseek-v4-flash=105。
- 相对 v2 全量纠偏+评分 7,757,415 token 下降 83.6%。该比较范围不完全相同：v3 复用了 v2 纠偏和证据，主要反映“只做工具价值评分、不生成路径”的边际成本。

## 对原混合搜索策略的复核

原 v2 策略组合在 v3 评分下：

| 角色通道 | 原组合 | 固定十槽分 | 全工具并集保留率 |
|---|---|---:|---:|
| tier1-distribution | gemini-full + product-exa | 87.5 | 94.9% |
| resale-retail | product-gemini + product-exa | 26.5 | 34.4% |
| project-services | product-exa + product-tavily | 75.2 | 93.4% |

产品工具中达到各自并集至少 98% 质量的最小组合：

| 角色通道 | v3最小组合 | 得分 | 产品工具并集保留率 |
|---|---|---:|---:|
| tier1-distribution | product-google-places-local + product-brave + product-gemini | 89.9 | 99.1% |
| resale-retail | product-google-places-local + product-gemini | 75.5 | 98.1% |
| project-services | product-google-places-local + product-searchapi | 79.3 | 98.8% |

包含 Gemini Full 基准在内、达到全工具并集至少 98% 的最小回溯组合：

| 角色通道 | v3最小组合 | 得分 | 全工具并集保留率 |
|---|---|---:|---:|
| tier1-distribution | product-google-places-local + gemini-full + product-gemini | 91 | 98.7% |
| resale-retail | product-google-places-local + product-gemini | 75.5 | 98.1% |
| project-services | product-google-places-local + product-searchapi | 79.3 | 98.5% |

这些组合是冻结候选池上的 oracle 回溯，不应直接变成固定并行调用清单；尤其 Places 的高分伴随较高原始噪声和补证成本，应作为分区、分批的候选库扩展通道。

### 可优化点

1. 将“固定工具组合”改为“角色通道核心工具 + 候选库缺口触发”。长期搜索不以 Top-N 为生产触发器，而以新增长期有效唯一候选率、角色/地区覆盖缺口、重复率和证据缺口决定是否扩展 provider。
2. 一级分销单独保留规划式发现。普通本地地图与通用 SERP 即使总榜表现好，也不能替代对 Distributor/VAD 下级渠道网络、采购规模和品牌组合的专门查询。
3. 转售/零售应从旧的 B2B 合并通道进一步拆分查询模板：E-tailer/Retailer 面向消费者与 SOHO，VAR/Reseller 面向 SMB 采购与项目；评分可以汇总，发现模板不应继续共用。
4. 项目服务继续区分全国/企业 SI 与地方 Installer/区域 ISP。先运行高精度语义/官网核心工具；只有地区覆盖不足或用户明确要长尾时才分区启动 Places。
5. provider 停止条件改为边际价值：新增候选经过轻量角色识别后，如果连续一批没有新增 eligible/research-required 唯一公司、没有填补角色/地区缺口，或与候选库重复率过高，就停止该 provider。
6. 评估 provider 时增加“独有高价值候选数”。本轮各工具独有且达到相应角色全局第十名阈值的数量为：product-google-places-local=10，gemini-full=5，product-tavily=2，product-gemini=1，product-searchapi=1，product-brave=4，product-exa=0，product-google-places=0。该指标比原始候选量更能反映互补价值。
7. v3 结果支持继续采用先去重、再统一评分的架构；同一公司被多个工具命中时只评分一次，provider 仅继承该公司的统一分数，避免按工具重复消耗模型。
8. 原一级分销组合保留全工具并集 94.9%，可继续作为高精度核心，但 Exa 本轮独有高价值候选为 0；将 Brave/Product Gemini 作为缺口触发补充比固定追加 Exa 更值得验证。原转售/零售组合仅保留 34.4%，必须优先改造；项目服务组合保留 93.4%，属于可渐进优化而非推倒重做。
9. 207 家中有 5 家达到满分，说明顶端存在一定饱和。该现象没有改变工具排名，但后续评分校准应收紧“机会风险”和“定位兼容”的满分证据要求；本轮不做事后改分。

## 口径与限制

- 本报告只评价搜索结果质量，不评价合作路径、开发策略、联系人或邮件。
- 所有候选事实来自 v2 冻结证据；没有证据的事实保持 unknown。报告不代表 2026-08-30 之后的公司变化。
- v3 工具主角色不参考原搜索通道；Hybrid 候选只依据已有证据选一个用于工具榜的主角色，不生成路径。
- 输入指纹：`954e9a7ad39eea18be802081f860495bfea96171f762bbd71d69754f0842dfa8`。
