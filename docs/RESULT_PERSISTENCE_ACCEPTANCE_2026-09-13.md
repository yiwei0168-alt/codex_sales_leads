# 实际产品结果保存验收

阶段63，执行`node scripts/run-tsx.cjs scripts/verify-result-persistence.ts`。合成候选与评估直接进入产品`persistLeadWorkflowResult`，使用实际应用角色/事务、公司国家存储、证据快照、成本分摊和观测写入函数。没有搜索、模型、SMTP或队列认领，不属于新实验。

实际发现并修复产品故障：`saveEvidenceSnapshots`在整数freshness_days和文本拼接interval中复用$10，PostgreSQL报`42P08 inconsistent types deduced (text versus integer)`，导致带当前有效证据的结果无法入库。现两处显式使用integer，并以`interval '1 day'`乘法计算到期时间，保留原天数规则。

通过的实际SQL结果：

- 两个国家CO/MX、同一随机`.fixture.invalid`公司，每国两次并发保存，共4调用。仅1全局公司身份、2国家记录，每条revision=1；交付结果相同，没有并发重复创建或更新。
- 两国各1当前证据快照，expires_at精确等于retrieved_at加freshness_days；每国7事件，共14。系统saved/selected与未知用户采用/查看的边界保留；来源贡献displayed=null、selected=true且selectionActor=system。
- 两个隔离合成预留分别11/12微美元，实际结果事务补齐分摊集合，每国一份完整分摊、未分配0、合计23，原预留及settled=null保留，不假报费用核销。
- 新公司opportunityStage=Discovered，资格判断不把公司自动加入开发采用清单。其他用户读取事件及国家记录均为空。
- 合成账号、工作区、预算、预留、公司与关联记录清理成功。当前真实验收账号与USD30累计预算未修改；合成23微美元不是真实供应商消费。

失败与恢复记录：第一次fixture使用非法action状态，事务回滚；随后清理遗漏无级联的工作区/预算外键，两次残留各2个严格标识的合成用户，按已知ID及fixture身份核验后事务清理。脚本改为受身份/合成费率检查保护的事务清理，并等待所有并发调用终结后清理，之后完整运行两次成功。产品SQL类型错误由实际保存路径暴露并修复，不能把前面的fixture错误算作产品故障。

范围限制：本阶段证明合成输入经过真实产品存储链路，替代此前“只调用观测函数/合成业务保存适配器”的不足。仍未证明自然语言到真实搜索/评分、实际模型输出、页面采用动作或整体验收完成。

最终回归：832测试/182文件、生产build含类型检查、刷新后生成文档check通过；本阶段不重复SMTP或付费连通性测试。
