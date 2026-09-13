# 结果保存与用户采用的观测边界

阶段62，A21/plan阶段7既有授权。发现结果保存器自动写入`displayed`和`selected`事件，含义实际是系统交付；角色`valid`还仅凭resolvedRoles非空计数，会把未完成或主角色待定混入有效量。

新事件版本`workflow-artifact-v2`将结果保存改为`saved`和`delivery-selected`，明确actor=system。`userAdoptedItems`及`uiViewedItems`保持null，而非零或交付数量。所有事件带countryCode和`final-run-persistence-input`集合边界：这组生成/有效/引用计数覆盖最终入库输入，不能拿来代替原始发现漏斗或唯一公司总量。有效校正按现有correctionCompletion完成契约计数。用户实际采用仍需真实UI动作证据，本阶段没有宣称已接完该链路。

同步更新新运行的搜索来源贡献行：`displayed=null`，保留原selected字段作为系统交付选择的兼容值，metadata显式标记selectionActor、保存结果及未知查看/采用。历史已完成run仍由deliveryCounts门禁复用，不重写旧事件、旧贡献或历史评分。旧`selected`/`displayed`缺版本信息时不得追溯认定用户采用。

迁移054保留原事件枚举，追加两个事件类型；仅v2且关联run的观测增加按user/run/stage/artifact/event唯一索引。相同重试不追加，冲突计数或归属拒绝；与原保存事务和run锁共同使用，刷新/恢复不累计新交付。没有新表或原文存储。

验收：4项针对性测试通过；`verify-artifact-observations.ts`先在全事务回滚模式验证，再`--apply`应用迁移，合成账号/工作区/会话/run/事件均通过savepoint回滚。实际应用数据库角色验证两次写入仅7事件、保存与系统筛选各1、查看/采用null、国家归属、冲突拒绝和跨用户不可读，0付费。832全量测试/182文件通过；之后补来源贡献行边界，重新生产build验证。模型/完整业务结果入库和UI实际采用仍不是本脚本覆盖范围。

应用与回滚：部署此产品代码前先运行`node scripts/run-tsx.cjs scripts/verify-artifact-observations.ts --apply`，目标库必须与应用同主机/端口/数据库。迁移已在当前应用库应用。应用代码回滚可保留兼容扩展约束与索引，旧事件类型仍合法；不要删新事件或重写历史来缩回枚举。若需物理撤销schema，先处理新版本写入与数据保留方案，本阶段不自动收窄约束。
