# PRD v0.3 Acceptance Report

2026-09-13阶段25：O01–O05用户已确认采纳（D13），尚未实现；旧待采纳表述仅为历史。OpenRouter完整报告核销已完成真实数据库+合成传输验证；761 tests/170 files、typecheck及生产build通过。整体业务验收仍未完成，[当前矩阵](CURRENT_ACCEPTANCE_MATRIX_2026-09-13.md)优先于历史Demo清单。

## 2026-09-13 当前调查与验收入口

本轮范围按确认规则 A21/D12 执行。[当前唯一验收矩阵](CURRENT_ACCEPTANCE_MATRIX_2026-09-13.md) 覆盖下文历史的当前状态描述；旧失败与旧测试数量仅作阶段历史。模型连通性和 SMTP 发送/用户确认收件已通过，不因恢复而重测。整体仍未通过。

[哥伦比亚流失调查](COLOMBIA_CANDIDATE_ATTRITION_2026-09-13.md) 已新增545条公司×类别的脱敏离线关联、7来源哈希、8项对账与完整原成本台账核对；本次产品回归722 tests/169 files通过。39个输出槽位含1家跨类重复，评测有效38；未找到可直接补回的完整合格遗漏，原历史缺失不当作不合格。O01–O05仅为待采纳建议，不改搜索/角色/评分代码。新增模型token/API额度/付费调用/费用均0，实际用户采用未知。效率机会优先恢复未完成状态及减少重复证据工作；不虚构实际节省率。详细原各阶段输入/有效/下游使用/费用/延迟/重试/丢弃原因/使用率在关联JSON中，不能把跨阶段累计量当唯一公司数。

## Completed in the Demo

| Acceptance | Result |
|---|---|
| AC-01 new-market multi-node flow | Scenario switch, market playbook, Distributor and downstream results, role scoring, evidence, map, shortlist and plan are implemented. |
| AC-02 existing-distributor growth | Growth mode keeps Exel as the supply anchor and focuses results on downstream opportunities with Distributor Supply as the normal path. |
| AC-03 large ISP handling | Large ISPs render as Downstream + ISP + KA with Deep involvement and Brand Direct or Co-supply recommendations. |
| AC-04 manual edits stay consistent | Account Tier, Supply Model, Brand Involvement and stage update shared state used by list, detail, opportunities and plan. |
| AC-D01 real company identity | 50 Tavily live-search candidates; every company has source evidence and requires identity review. |
| AC-D02 role coverage | Distributor/VAD, resale/retail, SI/MSP and ISP are included. |
| AC-D03 evidence metadata | URL, title, capture date, evidence state, confidence and supported claim are available. |
| AC-A01 taxonomy | Automated tests enforce KA outside ChannelRole and ISP inside Downstream Channel. |
| AC-A02 score separation | Opportunity Fit and Evidence Confidence are displayed separately. |
| AC-A03 evidence-linked draft | Development drafts include visible Evidence IDs. |
| AC-A04 eval samples | 12 brief examples and 20 classification benchmark samples are included and tested. |
| AC-T01 documentation | README, startup, `.env.example`, data notes, architecture and reference schema are included. |
| AC-T02 quality gates | Build, TypeScript, ESLint and Vitest are configured. |
| AC-T05 degraded-state rule | Snapshot is explicitly labelled; no mock company is presented as a real live-search result. Provider error contract is included. |
| AC-T06 basic accessibility | Keyboard-focus styles, semantic tables, labelled inputs, buttons and keyboard-selectable SVG nodes are included. |
| AC-C01 conversational home | Persistent user-scoped conversations support create, rename, delete, greetings and suggested prompts. |
| AC-C02 grounded knowledge Q&A | Product, company and approved mailbox questions use tenant-aware RAG and render source citations. |
| AC-C03 explicit search confirmation | Natural-language lead requests produce a country/role/count plan; Tavily is called only after authenticated confirmation. |
| AC-C04 global market partitioning | Country names are resolved across major UI languages and saved results are grouped by country in one global workspace. |
| AC-C05 updated visual system | The main workspace, chat, login and mailbox surfaces use a responsive iPadOS-inspired light visual system. |
| AC-V01 production contact scoring | DeepSeek evidence assessment plus deterministic hard gates publish auditable current decisions; accepted, review and invalid outcomes remain separate. |
| AC-V02 safe automation | Automatic mode verifies only Official/HighConfidence, retains crawler source status, supersedes older decisions, and keeps outbound verification disabled. |

## Simplified for Demo

- The pages in PRD section 9 are presented as one persistent desktop workspace with navigable views rather than separate URLs.
- Search uses Tavily live API runs persisted in PostgreSQL; SerpAPI remains a planned next-version provider.
- Role-aware scoring inputs are stored in the snapshot and priority is deterministically recomputed; a production scoring configuration UI is not included.
- The map provides verified and hypothesis states; confirmation buttons are visual Demo controls and do not yet persist relationship decisions.
- Manual edits persist in the authenticated owner-scoped PostgreSQL workspace.
- The development assistant uses deterministic role rules instead of a live LLM so the Demo needs no credential and remains reproducible.

## Not implemented

- Scheduled source refresh and change detection
- Model telemetry and full prompt audit persistence
- Snov-backed verified contact enrichment and any outbound message sending
- Full responsive mobile layout; the PRD's 1280px desktop target is the primary layout
- Browser E2E automation in CI; unit/domain tests are included

## Quality commands

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```
