# MA20 对话任务呈现与确认减法验收

确认来源见 [MA20-01/02](CONFIRMED_PRODUCT_RULES.md)，工作流边界见 [主 Agent 工作流](MAIN_AGENT_WORKFLOW.md)。本记录只描述已实现和已验证的行为。

| 范围 | 实现 | 验证 |
| --- | --- | --- |
| 对话任务位置 | `agent-runs` 拆为按对话读取的 hook 和单任务卡；`assistant-home` 根据用户消息保存的 `metadata.runId` 在其下方渲染当前/待确认任务，未关联的旧任务放在消息末尾；完成卡默认隐藏，事件细节折叠。 | `tests/browser/assistant-flow.spec.ts` 桌面、手机 2 项通过，确认卡位置与页面无横向溢出。 |
| 减少重复确认 | 普通公开 `web_search`、单渠道公开搜索按只读调用处理；旧线索卡不叠加浏览器确认；主 Agent 指令明确最终精确批准覆盖同范围计划。发信、删除、正式发布等仍走原有批准。 | `business-tools.test.ts` 5 项通过；定向 ESLint、`tsc --noEmit`、`next build` 通过。 |
| 本地运行 | 旧服务停止后构建并启动单个 Next、LangGraph 和主 Agent worker；静态资源检查通过。 | `/api/auth/session` 返回 200，`ui:check-assets` 检查 10 个文件。 |

浏览器用例使用隔离固定响应，不代表长时真实模型任务、付费调用或邮件发送已经验收。
