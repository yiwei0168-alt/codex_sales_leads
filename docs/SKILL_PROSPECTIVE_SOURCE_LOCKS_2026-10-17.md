# 前瞻捕获与 campaign 来源保护

G09 锁内材料重建此前保护原任务和日志，却未锁定前瞻 job 与 campaign。重建后并发停用 campaign 或改写捕获内容，可能使已检查的来源失效。

迁移 `150_skill_shadow_source_locks.sql` 提供仅供应用角色调用的受限锁函数。它要求 job/run 成对匹配当前账号，限制单次 100 对、拒绝空成员和重复 job；先锁 campaign，再锁 job，等待后重新检查归属和关联。只授予函数执行权，不新增表写权限。锁定不代表来源合格，停用、时间与内容是否有效仍由现有材料重建判断。

`lockSkillAcceptanceRunJournals` 从已保存包的 `prospectiveSources` 派生 job/run，拒绝同一 job 指向不同任务，去重排序后分批调用函数。数量不符或迁移缺失时拒绝返回成功；锁内 readiness 暴露捕获保护标记和 job 数量，`sourceRevocationsLocked` 仍为 false，自动启用仍关闭。

实际新数据库验证已通过 campaign 停用与 job 捕获改写等待、释放后恢复、跨账号/错误任务/重复绑定拒绝及直接写表拒绝；迁移重复安装通过。28 项定向回归、类型检查和 lint 通过。源码基线 `45a4cc6b` 包含该接线的同冻结五类完整回归已退出 0：五题组合、统一回读和持锁重建通过，前瞻捕获来源锁为 true，缺失人工判定仍阻断策略。实际模型调用 0，网络和预算为合成适配器。[证据](evidence/ma24-g09-prospective-source-locks-2026-10-17.json)。

此项只覆盖所选前瞻元数据，不证明全部可变来源、自然时间失效、生产身份或最终启用事务已完成。G14–G20 继续暂缓。

## 租约的重建后复查

影子 worker 的准备入口现在在快照重建后，用数据库 `clock_timestamp()` 再检查 running 状态、租约 token、租约到期、campaign 启用/到期及任务年龄；此前只在重建前检查，长时间准备可能跨过租约边界。无租约的只读历史审核沿用原有规则。17 项回归通过，实际数据库时间边界验收和修改后的完整联验尚未进行。该补强不授予启用资格。[证据](evidence/ma24-g09-shadow-lease-recheck-2026-10-17.json)。
