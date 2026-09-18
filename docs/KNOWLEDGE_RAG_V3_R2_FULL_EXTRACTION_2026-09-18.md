# KQ04 RAG v3 R2 全量抽取与影子 release 证据

日期：2026-09-18。状态：全量本地抽取、影子入库、事实重建和 Qwen dry-run 已完成；本地 BGE 全量生成进行中。release 保持 `building` 且未激活。

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

## 失败、重试与修复

- 第一次影子写入因未复核 unit 把自动 `reviewReason` 写入人工 `review_note`，触发 schema check；修复为自动原因只放 metrics，人工 note 仅在有决定时写入，第二次成功。
- 初始 chunk 唯一键导致 3,008 期望值只剩 2,089 个实体查询可见 chunk；migration 087 和 revision-scoped 清理/冲突键修复后，3,008/3,008 实际存在。
- 第一次本地 BGE 64 项批次超过 30 秒客户端 timeout，未写向量并记录 failed run；1 项探针 888 ms、16 项探针 13,371 ms 均成功，随后使用 32 项批次和 120 秒 bulk timeout 可恢复执行。

## 仍阻止激活的门禁

- 46 个新增 source-unit 复核建议仍需用户确认；当前建议文件不是确认记录。
- 事实 candidate/conflicting 复核队列、至少 300 条独立人工 gold、Recall@8、比较答案、ACL、缓存失效、恢复/回滚与真实 UI 链路尚未完成。
- BGE 必须达到 3,008/3,008；Qwen 全量付费调用必须获得 dry-run 后的独立明确授权并达到 3,008/3,008。
- release 状态仍为 `building`，活动 pointer 为 0，旧生产 release 继续服务。

## 成本与效率

外部文档、模型、搜索、SMTP 调用均为 0；Docling/RapidOCR/BGE 均在本机运行。BGE API 现金成本为 0，模型下载、磁盘、CPU、RAM、电力和基础设施成本未知。Qwen 现金成本保持未知，不用 token 估算冒充账单。优化机会：保持 SHA checkpoint、只对零/低文本单元做高分辨率 rescue、按内容哈希复用 28 个旧 Qwen 向量，并把本地 BGE 批次固定在已实测不会 timeout 的大小。
