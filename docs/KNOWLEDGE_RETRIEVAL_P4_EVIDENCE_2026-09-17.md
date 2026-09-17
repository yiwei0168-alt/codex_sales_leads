# KQ01 P4 通用属性、别名与可验证事实验收

日期：2026-09-17

P4 增加 `attribute-registry-v1`、受控实体别名、typed `knowledge_fact` 合同和来源级 RLS。注册表覆盖路由器、交换机/PoE、AP、Mesh、4G/5G CPE、USB/SFP 配件，以及公司/行业角色与条款；查询归一化支持中英文、NFKC、乘号和最长型号边界，不包含任何型号答案。

影子代本轮产生 312 个当前断言：43 verified、216 candidate、53 conflicting；另有 148 条先前规则产物被追加标记 rejected，未物理删除。坐标拼接、含义不唯一的“最大整机功耗”等只进入 candidate；直接来源属性绑定完整时才允许 verified。多版本/多来源不同值保留 conflicting，不强选一条覆盖所有版本。

真实样本审计显示：AP3000/HS105 的 2.5G 没有成为新 verified 蜂窝事实；GS1010PE 的 8 个 PoE 口、2 个 uplink、120W 待复核功耗、LT700 的 SIM/接口、WU650 USB 版本、RE1200 接口均可追溯到原件断言。公司和行业分别产生角色定义/政策条件断言。部分型号尺寸和接口存在多版本冲突，继续阻止无版本快速直答。

模型、embedding、搜索和 SMTP 调用为 0。P4 只构建影子事实，不激活 P5 快速回答。
