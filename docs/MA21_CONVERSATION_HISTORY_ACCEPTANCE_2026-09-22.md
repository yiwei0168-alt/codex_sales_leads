# MA21 对话历史操作验收

确认来源见 [MA21-01](CONFIRMED_PRODUCT_RULES.md)，界面方案见 [MA15/MA21 前端记录](FRONTEND_SIMPLIFICATION_PLAN_2026-09-21.md)。

| 范围 | 实现 | 验证 |
| --- | --- | --- |
| 当前对话与更多菜单 | 历史项右侧单个更多按钮；当前项使用 `rgba(226,214,255,.72)` 半透明浅紫底色。菜单包含重命名、技术流水、删除，支持 Escape、焦点返回和外部点击关闭。 | `tests/browser/conversation-history.spec.ts` 桌面、手机 2 项通过，包含颜色、菜单、弹窗、删除与页面横向溢出检查。 |
| 技术流水 | 弹窗按当前账户、对话和任务读取已保存事件，按需加载后续页，作为只读信息不占对话主流。 | 隔离浏览器用例验证任务事件可见；未用付费模型生成新事件。 |
| 删除边界 | 迁移 104 添加 `deleted` 状态；隐藏历史和普通读取，保留消息、任务与审计；queued/running/waiting_user/paused 任务和 confirmed/running 旧动作阻止删除；已有对话的新任务先锁定并校验活动状态，避免与删除并发。 | 本地 `db:migrate` 通过；`scripts/verify-conversation-history-delete.ts` 合成账户检查禁删、跨账户隔离、历史隐藏和任务/消息保留，通过且清理测试账户。 |
| 编译与服务 | TypeScript、定向 ESLint、生产构建和本地静态资源检查通过。 | `next build`、`ui:check-assets` 10 个文件、会话端点 200。 |

删除是软删除：不会清除原始任务、审计记录或供应商回执。这是为了任务恢复与重复外部动作防护；如果将来需要永久擦除，需另行设计保留期及关联数据清理。
