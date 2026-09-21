# MA11 主 Agent 能力覆盖核对

本表从可执行工具注册表生成。基线为原有 74 项；`lead_workflow` 和本轮补齐的页面共用服务适配器使当前目录达到 88 项。`可调用`只表示工具有注册的 schema、账户/角色门禁和服务适配器，不代表外部连接可用、业务结果已生成或真实模型已选中。具体用途见 [工具目录](MAIN_AGENT_TOOL_CATALOG.md)。

| 工具 | 状态 | 角色 | 效果 | 费用状态 |
|---|---|---|---|---|
| `lead_workflow` | 可调用 | member | publish | unknown |
| `company_assessment_read` | 可调用 | member | read | known |
| `company_correspondence_list` | 可调用 | member | read | known |
| `relationship_list` | 可调用 | member | read | known |
| `relationship_save` | 可调用 | member | reversible | known |
| `relationship_analyze` | 可调用 | member | reversible | unknown |
| `contacts_lookup` | 可调用 | member | reversible | unknown |
| `mail_sync` | 可调用 | member | reversible | unknown |
| `workspace_mode_update` | 可调用 | member | reversible | known |
| `development_feedback_generate` | 可调用 | member | reversible | unknown |
| `mailbox_rescreen` | 可调用 | member | reversible | known |
| `mailbox_learning_review` | 可调用 | member | publish | unknown |
| `mail_message_company_update` | 可调用 | member | publish | known |
| `mail_message_delete` | 可调用 | member | destructive | known |
| `mail_connection_control` | 可调用 | member | destructive | known |
| `task_reconcile` | 可调用 | member | publish | known |
| `knowledge_gold_review_list` | 可调用 | admin | read | known |
| `knowledge_gold_review_save` | 可调用 | admin | publish | known |
| `knowledge_gold_holdout_unlock` | 可调用 | admin | publish | known |
| `mailbox_knowledge_list` | 可调用 | member | read | known |
| `knowledge_shared_text_upsert` | 可调用 | admin | publish | unknown |
| `budget_read` | 可调用 | member | read | known |
| `task_usage_read` | 可调用 | member | read | known |
| `run_read` | 可调用 | member | read | known |
| `run_control` | 可调用 | member | reversible | known |
| `search_connections` | 可调用 | member | read | known |
| `web_search` | 可调用 | member | publish | unknown |
| `search_channel` | 可调用 | member | publish | unknown |
| `development_strategy` | 可调用 | member | read | unknown |
| `draft_generate` | 可调用 | member | read | unknown |
| `follow_up_list` | 可调用 | member | read | known |
| `follow_up_generate` | 可调用 | member | reversible | unknown |
| `company_research` | 可调用 | member | read | known |
| `evidence_collect` | 可调用 | member | reversible | unknown |
| `role_correct` | 可调用 | member | read | unknown |
| `company_score` | 可调用 | member | read | unknown |
| `score_review` | 可调用 | member | read | unknown |
| `mail_send` | 可调用 | member | send | unknown |
| `mail_batch_send` | 可调用 | member | read | unknown |
| `schedule_list` | 可调用 | member | read | known |
| `schedule_create` | 可调用 | member | publish | known |
| `schedule_control` | 可调用 | member | reversible | known |
| `memory_read` | 可调用 | member | read | known |
| `memory_history_search` | 可调用 | member | read | known |
| `legacy_memory_save` | 可调用 | member | publish | unknown |
| `preference_save` | 可调用 | member | reversible | known |
| `policy_save` | 可调用 | member | publish | known |
| `skill_list` | 可调用 | member | read | known |
| `skill_import` | 可调用 | member | reversible | known |
| `skill_import_source` | 可调用 | member | reversible | unknown |
| `skill_read` | 可调用 | member | read | known |
| `skill_manage` | 可调用 | member | reversible | known |
| `skill_publish` | 可调用 | admin | publish | known |
| `skill_script` | 可调用 | member | read | unknown |
| `knowledge_search` | 可调用 | member | read | known |
| `knowledge_facts` | 可调用 | member | read | known |
| `knowledge_status` | 可调用 | member | read | known |
| `knowledge_library_list` | 可调用 | member | read | known |
| `knowledge_revision_list` | 可调用 | member | read | known |
| `knowledge_upload_jobs` | 可调用 | member | read | known |
| `knowledge_private_delete` | 可调用 | member | destructive | known |
| `knowledge_fact_review_list` | 可调用 | admin | read | known |
| `knowledge_fact_review_decide` | 可调用 | admin | publish | known |
| `knowledge_originals` | 可调用 | member | read | known |
| `company_search` | 可调用 | member | read | known |
| `company_read` | 可调用 | member | read | known |
| `company_state_update` | 可调用 | member | reversible | known |
| `task_list` | 可调用 | member | read | known |
| `task_detail` | 可调用 | member | read | known |
| `memory_list` | 可调用 | member | read | known |
| `agent_memory_inventory` | 可调用 | member | read | known |
| `agent_memory_set_active` | 可调用 | member | reversible | known |
| `decision_memory_set_active` | 可调用 | member | publish | known |
| `global_policy_set_active` | 可调用 | admin | publish | known |
| `legacy_memory_set_active` | 可调用 | member | publish | known |
| `legacy_memory_delete` | 可调用 | member | destructive | known |
| `company_add` | 可调用 | member | reversible | known |
| `draft_read` | 可调用 | member | read | known |
| `draft_edit` | 可调用 | member | reversible | known |
| `draft_approve` | 可调用 | member | reversible | known |
| `development_workflow` | 可调用 | member | reversible | unknown |
| `market_plan` | 可调用 | member | read | unknown |
| `mail_connections` | 可调用 | member | read | known |
| `mail_history` | 可调用 | member | read | known |
| `mail_read` | 可调用 | member | read | known |
| `mailbox_candidate_list` | 可调用 | member | read | known |
| `mailbox_candidate_review` | 可调用 | member | publish | unknown |
| `plan_confirmation` | 可调用 | member | publish | known |

## 当前仅页面可用的已存在动作

| 领域 | 动作 | 页面入口与 Agent 差距 |
|---|---|---|
| 知识 | 共享二进制入库与发布 | `/api/knowledge/uploads`；共享文本已有管理员精确批准工具，二进制凭证化上传仍由页面处理 |
| 联系人 | 查询最近一次联系人补全运行 | `/api/contact-enrichment/runs/latest`；发现与保存用 `contacts_lookup` |
| 邮箱 | 创建或重新录入邮箱凭证 | `/api/mailbox/connections`；连接列表、同步、停用和删除可调用，凭证不得进入模型上下文，故仍由页面安全输入 |
| 管理 | 更改旧预算参考值 | `/api/budget` PUT；MA13 后不作为本轮流程与质量目标，旧页面继续保留 |

## 缺实现或明确后续阶段

| 能力 | 当前边界 |
|---|---|
| 正式评分发布 | 独立 `company_score` 只存研究产物；原完整工作流可排队，单项正式发布尚无 Agent 工具 |
| 独立联系人核验 | `contacts_lookup` 可发现/保存；独立验证与归属决定尚无 Agent 工具 |
| 未关联公司邮件的跟进草稿 | `follow_up_generate` 明确返回缺少公司上下文，不伪造归属 |
| MCP/API 连接、联网浏览器、私有 Git 连接 | MA11 后续阶段；当前注册工具不声称这些连接可用 |

发布、外发及重要删除仍以实际工具效果触发精确批准。管理员工具只有当前角色为管理员时才可执行。每项返回的数据、缺项、连接状态及真实回执须分别验收；本盘点本身不是 120 条回放或 8 条真实 GLM Batch 的证据。
