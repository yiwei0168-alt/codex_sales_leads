# MA24 G14 DBS 更正冲突题审核包

## 逐题材料

候选题 `dbs-2024-25-basic-checks-correction2-year-conflict` 询问 DBS《2024–25 年报》印刷第 38 页图 2 中 2021–22、2022–23 两年的 Basic DBS checks 原标签，以及前置更正单 Correction 2 要求采用的最终归属。

候选答案：图 2 仍显示 2021–22 年 **2,642,272**、2022–23 年 **2,657,121**。更正单要求改为 2021–22 年 **2,657,121**、2022–23 年 **2,642,272**。回答这份修订版年报的最终口径时采用更正单，并说明图示保留了旧标签；两组数字代表同一指标的冲突版本。

## 来源与核验

- [来源审核](evidence/ma24-g14-dbs-correction-conflict-source-review-2026-10-15.json)固定了 157 页原 PDF 的 SHA-256 `5902287709dd1049eae2429af4e87d8a5efbee5d123763b5735a72213f754a44`，并核对物理第 7 页更正单、第 41 页图 2（印刷第 38 页）。
- [全页视觉判决](evidence/ma24-g14-dbs-whole-pdf-visual-page-decisions-2026-10-16.json)对 151 个待审页块作原尺寸核对，保留 67 页视觉证据、排除 84 页装饰，第 41 页图 2 保留为视觉证据。
- [隔离产品回放](evidence/ma24-g14-dbs-full-review-clone-2026-10-16.json)已保存并读回 151 条判决，私有资料登记后回读第 7、41 页引用，另一账号无法读取，合成行已清理。
- 隔离 Gold 草案 `tmp/ma24-independent-quarantine/dbs-correction2-conflict-gold-draft-v1.json` 的 SHA-256 为 `8a7dbed8f52a4abe932a752a74c86830f8e626f7a32646be172bfaecf8862418`。三个目标摘录逐条匹配当前抽取/视觉审核的块 ID、页码和文本。

## 审核边界

此题属于“原图与前置更正冲突”的新题型，按 [MA24-10](CONFIRMED_PRODUCT_RULES.md)需逐题确认答案和限定。旧 350 行题已作有界排重；随后把它暂列为第 28 条草案，并在[本地整池近邻筛查](evidence/ma24-g14-dbs-current-28-pool-screen-2026-10-16.json)中与其余 27 题比较。[本机会话暴露审计](evidence/ma24-g14-dbs-local-rollout-exposure-2026-10-16.json)仅在候选准备窗口发现首次来源特征命中，不能排除未记录或远端暴露。用户确认候选内容后，仍须审查来源家族和整套题的独立性、正式冻结 Gold，并核验 G16 双路真实回答及引用。目前没有模型回答调用，G17–G20 暂停。
