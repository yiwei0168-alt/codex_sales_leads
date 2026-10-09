# 逐工具模式建议（待确认）

MODESEL-02 已确认快速模式包括已保存邮件、客户记录和时间线只读查询。下表已补入对应读取工具；具体按需展示策略仍为建议。mail_sync、写入、生成流程和新调查继续禁用，不能仅凭 effect=read 判断可用。

2026-10-09：覆盖代码注册的 104 个工具。字段带 * 表示顶层必填；嵌套字段、类型、约束及输出见 [完整定义](MAIN_AGENT_TOOL_DEFINITIONS.json)，工具用途见 [目录](MAIN_AGENT_TOOL_CATALOG.md)。默认/按需/禁用的含义见 [设计稿](AGENT_MODE_DESIGN_2026-10-09.md)。本表不是已上线权限配置。原角色、影子开关和知识范围限制始终优先。

| 工具 | 分组 | 输入字段 | 快速 | 标准 | 深入 | 原角色 / 作用 |
|---|---|---|---|---|---|---|
| customer_timeline | 日常业务 | customerId, country, offset* | 默认 | 默认 | 默认 | member / read |
| lead_workflow | 研究与评估 | countryCode*, countryName*, objective*, roles*, targetCount*, queryLanguage*, userRequest*, opportunityTargets, coverageMode, verifiedOnly | 禁用 | 禁用 | 默认 | member / publish |
| company_assessment_read | 日常业务 | companyExternalId* | 默认 | 默认 | 默认 | member / read |
| company_score_publish | 按意图加载的管理/动作 | sourceCallId*, companyExternalId*, expectedRevision*, expectedDomain*, expectedTotalScore*, expectedPolicyVersion* | 禁用 | 按需 | 按需 | member / publish |
| company_correspondence_list | 日常业务 | companyExternalId*, offset* | 默认 | 默认 | 默认 | member / read |
| relationship_list | 日常业务 | country* | 默认 | 默认 | 默认 | member / read |
| relationship_save | 按意图加载的管理/动作 | country*, from*, to*, type*, status*, basis*, sourceUrl*, selection | 禁用 | 按需 | 按需 | member / reversible |
| relationship_analyze | 研究与评估 | country*, from*, to* | 禁用 | 禁用 | 默认 | member / reversible |
| contacts_lookup | 研究与评估 | companyExternalId*, refresh* | 禁用 | 禁用 | 默认 | member / reversible |
| contacts_enrichment_latest | 日常业务 | 无 | 禁用 | 默认 | 默认 | member / read |
| contacts_candidate_list | 日常业务 | companyExternalId* | 默认 | 默认 | 默认 | member / read |
| contacts_verify_evaluate | 研究与评估 | emailCandidateId*, expectedEmail* | 禁用 | 禁用 | 默认 | member / publish |
| contacts_verify_publish | 按意图加载的管理/动作 | decisionId*, decisionHash*, email*, category*, activeStatus*, expectedCurrentDecisionId* | 禁用 | 按需 | 按需 | member / publish |
| mail_sync | 日常业务 | connectionId*, lookbackDays, maxMessages, folderScope*, from, through | 禁用 | 默认 | 默认 | member / reversible |
| development_feedback_generate | 按意图加载的管理/动作 | draftId*, feedback*, currentBody*, sourceRevision*, allowMemory* | 禁用 | 按需 | 按需 | member / reversible |
| mailbox_rescreen | 按意图加载的管理/动作 | 无 | 禁用 | 按需 | 按需 | member / reversible |
| mailbox_learning_review | 按意图加载的管理/动作 | messageId*, action* | 禁用 | 按需 | 按需 | member / publish |
| mail_message_company_update | 按意图加载的管理/动作 | messageId*, companyExternalId* | 禁用 | 按需 | 按需 | member / publish |
| mail_message_delete | 按意图加载的管理/动作 | messageId* | 禁用 | 按需 | 按需 | member / destructive |
| mail_connection_control | 按意图加载的管理/动作 | connectionId*, action*, deleteKnowledge* | 禁用 | 按需 | 按需 | member / destructive |
| task_reconcile | 按意图加载的管理/动作 | id*, kind* | 禁用 | 按需 | 按需 | member / publish |
| knowledge_gold_review_list | 按意图加载的管理/动作 | offset*, limit*, split, reviewed | 禁用 | 按需 | 按需 | admin / read |
| knowledge_gold_review_save | 按意图加载的管理/动作 | caseId*, caseSha256*, expectedAnswer*, expectedSources*, reviewNote* | 禁用 | 按需 | 按需 | admin / publish |
| knowledge_gold_holdout_unlock | 按意图加载的管理/动作 | 无 | 禁用 | 按需 | 按需 | admin / publish |
| mailbox_knowledge_list | 日常业务 | offset* | 默认 | 默认 | 默认 | member / read |
| knowledge_shared_text_upsert | 按意图加载的管理/动作 | collection*, externalId*, title*, content*, sourceType*, sourceUrl, authorityLevel*, language*, market, companyId, productId, expectedContentHash | 禁用 | 按需 | 按需 | admin / publish |
| knowledge_shared_binary_register | 按意图加载的管理/动作 | jobId*, sourceSha256*, language*, authorityLevel* | 禁用 | 按需 | 按需 | admin / publish |
| knowledge_shared_release_gate | 按意图加载的管理/动作 | releaseKey* | 禁用 | 按需 | 按需 | admin / read |
| knowledge_shared_release_activate | 按意图加载的管理/动作 | releaseKey*, releaseId*, expectedManifestHash* | 禁用 | 按需 | 按需 | admin / publish |
| budget_read | 按意图加载的管理/动作 | 无 | 禁用 | 按需 | 按需 | member / read |
| task_usage_read | 按意图加载的管理/动作 | 无 | 禁用 | 按需 | 按需 | member / read |
| run_read | 日常业务 | id*, after* | 禁用 | 默认 | 默认 | member / read |
| run_control | 按意图加载的管理/动作 | id*, action*, content | 禁用 | 按需 | 按需 | member / reversible |
| search_connections | 公开搜索 | 无 | 禁用 | 按需 | 默认 | member / read |
| web_search | 公开搜索 | questions* | 禁用 | 按需 | 默认 | member / read |
| search_channel | 公开搜索 | provider*, query*, countryCode*, countryName*, languageCode*, maxResults*, category*, engine* | 禁用 | 按需 | 默认 | member / read |
| development_strategy | 日常业务 | companyExternalId*, language, instructions | 禁用 | 默认 | 默认 | member / read |
| draft_generate | 日常业务 | companyExternalId*, language, instructions | 禁用 | 默认 | 默认 | member / read |
| follow_up_list | 日常业务 | parentId* | 禁用 | 默认 | 默认 | member / read |
| follow_up_generate | 日常业务 | parentId*, instructions* | 禁用 | 默认 | 默认 | member / reversible |
| company_research | 研究与评估 | companyName*, domain*, countryCode*, countryName*, objective*, roles* | 禁用 | 禁用 | 默认 | member / read |
| evidence_collect | 研究与评估 | sourceCallId* | 禁用 | 禁用 | 默认 | member / reversible |
| role_correct | 研究与评估 | sourceCallId* | 禁用 | 禁用 | 默认 | member / read |
| company_score | 研究与评估 | sourceCallId* | 禁用 | 禁用 | 默认 | member / read |
| score_review | 研究与评估 | sourceCallId* | 禁用 | 禁用 | 默认 | member / read |
| vectorless_start | 资料与记忆读取 | question* | 默认 | 默认 | 默认 | member / read |
| vectorless_search | 资料与记忆读取 | sessionId*, filters* | 默认 | 默认 | 默认 | member / read |
| vectorless_browse | 资料与记忆读取 | sessionId*, documentId*, parentId* | 默认 | 默认 | 默认 | member / read |
| vectorless_read | 资料与记忆读取 | sessionId*, nodeId* | 默认 | 默认 | 默认 | member / read |
| vectorless_aggregate | 资料与记忆读取 | sessionId*, documentIds* | 默认 | 默认 | 默认 | member / read |
| vectorless_filter | 资料与记忆读取 | sessionId*, documentIds*, filters* | 默认 | 默认 | 默认 | member / read |
| vectorless_v3_candidates | 资料与记忆读取 | sessionId* | 默认 | 默认 | 默认 | member / read |
| mail_send | 按意图加载的管理/动作 | connectionId*, companyExternalId, to*, subject*, body*, parentId, followUpDraftId, attachments | 禁用 | 按需 | 按需 | member / send |
| mail_batch_send | 按意图加载的管理/动作 | batchId*, items* | 禁用 | 按需 | 按需 | member / read |
| schedule_list | 按意图加载的管理/动作 | 无 | 禁用 | 按需 | 按需 | member / read |
| schedule_create | 按意图加载的管理/动作 | title*, content*, timezone, plan* | 禁用 | 按需 | 按需 | member / publish |
| schedule_control | 按意图加载的管理/动作 | id*, version*, enabled* | 禁用 | 按需 | 按需 | member / reversible |
| memory_read | 资料与记忆读取 | market, company | 默认 | 默认 | 默认 | member / read |
| memory_history_search | 资料与记忆读取 | query*, market, company, role, offset*, limit* | 默认 | 默认 | 默认 | member / read |
| memory_observation_search | 资料与记忆读取 | query*, businessAt, knownAt, marketCode, companyId | 默认 | 默认 | 默认 | member / read |
| legacy_memory_save | 按意图加载的管理/动作 | id*, mode*, expectedUpdatedAt, kind*, title*, content*, marketCodes*, channelRoles*, externalUseApproved*, confirmed* | 禁用 | 按需 | 按需 | member / publish |
| preference_save | 按意图加载的管理/动作 | key*, content*, markets*, companies*, validUntil, expectedVersion | 禁用 | 按需 | 按需 | member / reversible |
| policy_save | 按意图加载的管理/动作 | key*, content*, kind*, scope*, mandatory*, markets*, companies*, validUntil, expectedVersion | 禁用 | 按需 | 按需 | member / publish |
| skill_list | 日常业务 | 无 | 禁用 | 默认 | 默认 | member / read |
| skill_import | 按意图加载的管理/动作 | skillId, expectedVersion, name*, source*, files*, dependencies* | 禁用 | 按需 | 按需 | member / reversible |
| skill_import_source | 按意图加载的管理/动作 | kind*, name*, url, repository, ref, directory, skillId, expectedVersion | 禁用 | 按需 | 按需 | member / reversible |
| skill_read | 日常业务 | id* | 禁用 | 默认 | 默认 | member / read |
| skill_manage | 按意图加载的管理/动作 | id*, version*, operation* | 禁用 | 按需 | 按需 | member / reversible |
| skill_publish | 按意图加载的管理/动作 | id*, version* | 禁用 | 按需 | 按需 | admin / publish |
| skill_script | 按意图加载的管理/动作 | id*, entry*, input* | 禁用 | 按需 | 按需 | member / read |
| knowledge_search | 资料与记忆读取 | query*, limit*, collections | 默认 | 默认 | 默认 | member / read |
| knowledge_facts | 资料与记忆读取 | entity*, attributes* | 默认 | 默认 | 默认 | member / read |
| knowledge_status | 资料与记忆读取 | 无 | 默认 | 默认 | 默认 | member / read |
| knowledge_library_list | 资料与记忆读取 | scope*, query*, offset* | 默认 | 默认 | 默认 | member / read |
| knowledge_revision_list | 资料与记忆读取 | documentId*, offset* | 默认 | 默认 | 默认 | member / read |
| knowledge_upload_jobs | 按意图加载的管理/动作 | 无 | 禁用 | 按需 | 按需 | member / read |
| knowledge_private_delete | 按意图加载的管理/动作 | documentId*, expectedHash* | 禁用 | 按需 | 按需 | member / destructive |
| knowledge_fact_review_list | 按意图加载的管理/动作 | offset*, limit*, reason*, query*, status* | 禁用 | 按需 | 按需 | admin / read |
| knowledge_fact_review_decide | 按意图加载的管理/动作 | reviewId*, decision*, note*, correctedValue, correctedRawValue, correctedUnit | 禁用 | 按需 | 按需 | admin / publish |
| knowledge_originals | 资料与记忆读取 | query*, assetId | 默认 | 默认 | 默认 | member / read |
| company_search | 日常业务 | query*, countryCode | 默认 | 默认 | 默认 | member / read |
| company_read | 日常业务 | candidateId* | 默认 | 默认 | 默认 | member / read |
| company_state_update | 按意图加载的管理/动作 | externalId*, expectedRevision*, patch* | 禁用 | 按需 | 按需 | member / reversible |
| task_list | 日常业务 | 无 | 禁用 | 默认 | 默认 | member / read |
| task_detail | 日常业务 | id*, kind* | 禁用 | 默认 | 默认 | member / read |
| memory_list | 按意图加载的管理/动作 | 无 | 禁用 | 按需 | 按需 | member / read |
| agent_memory_inventory | 按意图加载的管理/动作 | offset* | 禁用 | 按需 | 按需 | member / read |
| agent_memory_set_active | 按意图加载的管理/动作 | id*, version*, expectedUpdatedAt*, active* | 禁用 | 按需 | 按需 | member / reversible |
| decision_memory_set_active | 按意图加载的管理/动作 | id*, version*, expectedUpdatedAt*, active* | 禁用 | 按需 | 按需 | member / publish |
| global_policy_set_active | 按意图加载的管理/动作 | id*, version*, expectedUpdatedAt*, active* | 禁用 | 按需 | 按需 | admin / publish |
| legacy_memory_set_active | 按意图加载的管理/动作 | id*, expectedUpdatedAt*, active* | 禁用 | 按需 | 按需 | member / publish |
| legacy_memory_delete | 按意图加载的管理/动作 | id*, expectedUpdatedAt* | 禁用 | 按需 | 按需 | member / destructive |
| company_add | 按意图加载的管理/动作 | name*, country*, website*, role | 禁用 | 按需 | 按需 | member / reversible |
| draft_read | 日常业务 | draftId* | 禁用 | 默认 | 默认 | member / read |
| draft_edit | 日常业务 | draftId*, body*, expectedRevision* | 禁用 | 默认 | 默认 | member / reversible |
| draft_approve | 按意图加载的管理/动作 | draftId*, expectedRevision*, body | 禁用 | 按需 | 按需 | member / reversible |
| development_workflow | 日常业务 | companyExternalId*, language, instructions | 禁用 | 默认 | 默认 | member / reversible |
| market_plan | 研究与评估 | countryCode*, countryName*, objective*, roles*, targetCount*, queryLanguage*, userRequest* | 禁用 | 禁用 | 默认 | member / read |
| mail_connections | 日常业务 | 无 | 禁用 | 默认 | 默认 | member / read |
| mail_history | 日常业务 | companyExternalId, offset* | 默认 | 默认 | 默认 | member / read |
| mail_read | 日常业务 | messageId* | 默认 | 默认 | 默认 | member / read |
| mailbox_candidate_list | 按意图加载的管理/动作 | 无 | 禁用 | 按需 | 按需 | member / read |
| mailbox_candidate_review | 按意图加载的管理/动作 | candidateId*, decision*, expectedHash* | 禁用 | 按需 | 按需 | member / publish |
| plan_confirmation | 按意图加载的管理/动作 | plan*, scale*, uncertainty*, requestedEstimate | 禁用 | 按需 | 按需 | member / publish |
