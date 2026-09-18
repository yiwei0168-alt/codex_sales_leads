# KQ04 RAG v3 R2 全量抽取与影子 release 证据

日期：2026-09-18。状态：全量本地抽取、影子入库、事实重建、Qwen dry-run 和本地 BGE 全量生成已完成。release 保持 `building` 且未激活。

## 已完成结果

- 数据库清单覆盖 281/281 个 `registered` 逻辑资产、221 个登记源路径、220 个唯一 SHA-256 内容工件和 653,805,572 registered bytes。唯一内容比路径少一份，是同一份 `产品通用功能_Ivy.pptx` 在 industry/product 两个受控路径登记；两个逻辑绑定均保留。
- 两个可恢复分片分别完成 111/111 与 110/110 个输入，失败均为 0；合并 checkpoint 验证 221/221。原始工件共 1,760 个 unit、2,871 个 Docling chunk、66 次本地二次 OCR，累计抽取延迟 8,998,359 ms；document/model/embedding 外部调用均为 0。
- 高分辨率本地 OCR rescue 只检查 16 个零/低文本待复核单元，4 个单元由 152 字符提升至 233 字符并替换为更完整 candidate，6 个纯封面未产生文本；0 外部调用、0 API 费用。
- 影子 release `889a1b5b-9b45-4695-a9b1-e2f2415a028f` 包含 281 source revisions、1,820 个逻辑 unit、3,008/3,008 chunk、270 个 XLSX 精确行绑定。内容工件与逻辑数差异来自共享 XLSX 行拆分和受控重复路径绑定，不是丢失。
- migration 087 将 chunk 唯一身份从错误的 `(release, document, chunk_index)` 修正为 `(release, source_revision, chunk_index)`，避免同一文档的多个登记 revision 相互覆盖；复核器验证 3,008 实际 chunk 等于 3,008 release asset 期望值。
- 对缺失 document entity 的 datasheet，通用规则只从 `“<精确型号> Datasheet …”` 标题建立 23 个精确产品实体；训练/目录材料再按 chunk 中完整型号 token 建立 `mentions`，不把整份多型号文档挂到单一型号。2,484 个 chunk 当前具有实体关系，524 个通用公司/行业证据保持无型号绑定。
- 未确认 OCR candidate 在入库前按 unit 决定硬过滤；验证结果为 `unacceptedCandidateChunks=0`。原已确认 26 个单元产生 29 个 candidate chunk，3 个装饰页保持带人工决定的 blank。新增 46 个单元只进入 open review；视觉建议为 33 candidate＋13 装饰页，尚未获得用户精确确认。
- 事实写入 3,000 条：1,180 verified、822 candidate、998 conflicting。WR3000 与 WR6500H 均有 verified/candidate/conflicting 事实和双方精确页/行引用；conflicting 不进入确定值快路径。
- Qwen dry-run：3,008 chunk、28 个内容哈希/模型/维数完全一致的旧向量可复用、2,980 个新调用输入、约 484,344 tokens、298 个十项请求，现金费用未知。未调用 Qwen。
- BGE 全量结果：3,008/3,008 个 chunk 均具有固定 revision 的 1,024 维本地向量，缺失 0。本次可恢复续跑处理 2,991 个输入、94 个批请求、1,785,049 ms、0 重试；其余 17 个来自成功的 1 项/16 项校准。API 现金成本为 0，本地 CPU/RAM/磁盘/电力与基础设施成本未知。

## 失败、重试与修复

- 第一次影子写入因未复核 unit 把自动 `reviewReason` 写入人工 `review_note`，触发 schema check；修复为自动原因只放 metrics，人工 note 仅在有决定时写入，第二次成功。
- 初始 chunk 唯一键导致 3,008 期望值只剩 2,089 个实体查询可见 chunk；migration 087 和 revision-scoped 清理/冲突键修复后，3,008/3,008 实际存在。
- 第一次本地 BGE 64 项批次超过 30 秒客户端 timeout，未写向量并记录 failed run；1 项探针 888 ms、16 项探针 13,371 ms 均成功，随后使用 32 项批次和 120 秒 bulk timeout 可恢复执行。

## 仍阻止激活的门禁

- 46 个新增 source-unit 复核建议仍需用户确认；当前建议文件不是确认记录。
- 事实 candidate/conflicting 复核队列、至少 300 条独立人工 gold、Recall@8、比较答案、ACL、缓存失效、恢复/回滚与真实 UI 链路尚未完成。
- Qwen 全量付费调用必须获得 dry-run 后的独立明确授权并达到 3,008/3,008；当前 Qwen 为 0/3,008，BGE 已为 3,008/3,008。
- release 状态仍为 `building`，活动 pointer 为 0，旧生产 release 继续服务。

## 后续用户确认（2026-09-18）

用户已把此前的全量视觉建议精确确认为 33 个 candidate 与 13 个装饰页，并授权当前 release 的 2,980 个新 Qwen `text-embedding-v4` 输入。机读决定与此前试点合并后为 59 candidate、16 decorative；该确认不改变 candidate 的非 verified 状态，也不允许坐标或文件版本继承。Qwen 实际调用量、成功数、tokens、延迟、重试和现金费用须以执行账本为准，完成前 release 继续保持未激活。

决定重放后，影子语料增至 3,062 chunks，unit open review 为 0，BGE 已补齐 3,062/3,062；事实为 3,053 条并保留 1,808 个 fact review。由于新增合法证据令完整 Qwen 需求变为 3,034 条，执行器把本次授权硬限制为 2,980 条。首次请求在 16 ms 的本地 DNS `ENOTFOUND` 前置失败，未连接供应商、未获得响应、未写入供应商向量；对应保守预留以追加审计方式核销为 verified-unbilled。沙箱外网络执行审批拒绝了后续尝试，因此没有绕过或第二次请求，当前仅有 28 条旧向量复用。

用户随后在获知最终资料范围、北京端点、约 497,611 tokens／304 请求及现金费用未知风险后再次明确确认，授权范围更新为全部 3,034 个尚未向量化的最终 canonical chunks，并允许沙箱外联网执行；此前的 2,980 硬上限因此被该精确最终授权取代。执行结果仍需另行记录，确认本身不构成成功或账单证据。

最终执行成功：3,034 个新 Qwen 向量与 28 个复用向量合计 3,062/3,062，BGE 亦为 3,062/3,062，双通道缺失均为 0。实际 Qwen 用量为 581,005 input tokens、304 请求、157,515 ms、0 重试；3,034 个输出全部通过维数/数量校验并写入 shadow release。供应商未返回可核销现金金额，现金费用保持未知；USD1.949248 仅为 304 次请求的保守预留上界总和，不作为实际费用。release 保持 `building` 且活动指针为 0，因为 1,808 个事实复核项、人工答案/来源 gold、Recall@8 和最终原子切换门禁仍未完成。

## 成本与效率

外部文档、模型、搜索、SMTP 调用均为 0；Docling/RapidOCR/BGE 均在本机运行。BGE API 现金成本为 0，模型下载、磁盘、CPU、RAM、电力和基础设施成本未知。Qwen 现金成本保持未知，不用 token 估算冒充账单。优化机会：保持 SHA checkpoint、只对零/低文本单元做高分辨率 rescue、按内容哈希复用 28 个旧 Qwen 向量，并把本地 BGE 批次固定在已实测不会 timeout 的大小。

## 本阶段验证

- 全量 Vitest：233 files、1,171 tests 通过；一个使用随机 UUID 的披露清洗夹具曾被卡号正则随机命中，改用固定非敏感 ID 后全量串行复跑通过。
- TypeScript、lint、Next.js 生产 build、LangGraph 配置/零外部调用路由探针、知识审计和 Playwright 浏览器套件通过；浏览器套件为 22 passed、2 designed skips。
- 隔离真实知识 UI 验证覆盖 1,366/390 两个视口、登录、原件授权访问/随机原件 404/匿名 401、事实/原件 API 与 LangGraph→SQL→UI。30 次热路径样本 p50 694.50 ms、p95 771.20 ms、max 774.50 ms；付费调用 0、外部网络 0。
- v3 完整性复核为 281 revisions、1,820 units、3,008 chunks、3,008 BGE、0 Qwen、0 active pointers、0 unaccepted candidate chunks、0 verifier violations。该结果不放宽 46 个 unit review、1,803 个 fact review、人工答案 gold 和 Qwen 门禁。
