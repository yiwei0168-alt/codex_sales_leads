# MA24 G14 新题型审核包：NTIA/NASA 18 GHz 报告

状态：**本题待新题型审核；不是已批准 Gold，不进入模型输入或冻结集。** 本包只覆盖一条题及当前草案池的有界重叠检查。G17–G20 暂停。

日期复核：原 PDF 物理第 3 页署期 **March 2025**，NTIA 的发布文章日期为 **2025 年 5 月 1 日**。题面按报告署期称“March 2025”准确；这不是其网页发布日期。见[日期与建议边界复核收据](evidence/ma24-g14-ntia-date-and-recommendation-check-2026-10-15.json)。

## 待审核题

> According to the March 2025 NTIA/NASA 18 GHz Band Report, why did the existing G117 military-only limit on federal FSS not itself restrict ISS? What separate restriction on federal ISS space-to-space links and what NTIA Manual update did the report recommend? Did the report settle non-federal ISS allocation priority as definitively primary? Answer only what this dated report said and cite its original pages.

ID：`ntia-18ghz-g117-iss-footnote-and-manual-recommendation`。类型建议：**有日期的官方技术建议 / 已有脚注与拟议变更区分**。此前按类型授权的五类设备规格/部署题不覆盖此类型，因此等待用户对代表题审核；审核结果不自动成为双路质量判决。

## 候选 Gold 答案及证据

G117 只把联邦固定卫星业务（FSS）限制为军用系统；星间业务（ISS）是另一业务类别，因此该脚注本身不约束 ISS。报告建议另设美国脚注，将本频段联邦系统的星间链路限定为与非联邦网络或系统进行空间中继通信；同时建议在联邦 ISS 分配变更时修订 NTIA Manual，以保护现有业务所需的 ePFD/PFD 限值。报告在提出共同主要分配方案的同时，明确建议 FCC 就**非联邦** ISS 分配应为主要还是次要征求意见。以上均是该报告截至 2025 年 3 月的建议，不能写成之后已生效的最终规则。

| 事实 | 原件坐标 | 产品抽取坐标 |
| --- | --- | --- |
| G117 的 FSS/ISS 类别区别 | PDF 物理第 8 页，印刷第 5 页，Observation 2 | `page-8-block-29` |
| 手册更新背景 | PDF 物理第 8 页，印刷第 5 页，Observation 3 | `page-8-block-31` |
| 非联邦优先级仍须征求意见；独立脚注及 ePFD/PFD 手册更新 | PDF 物理第 9 页，印刷第 6 页，Recommendations 2–4 | `page-9-block-7` |

原件：[NTIA 官方 PDF](https://www.ntia.gov/sites/default/files/2025-05/18-ghz-band-study-report.pdf)。私有原件 SHA-256：`ff6074c82f7c6abbab80a792ad3d1fae111074f64a492395d2c3c7b78f0c8e42`。原件与产品块已逐页核对；当前私有 Gold 草案仅列 `page-8-block-29` 和 `page-9-block-7`，两块已覆盖答案所需事实。上表补列 `page-8-block-31` 供人工复核手册背景，不自行扩写冻结 Gold。

## 当前独立性与准入边界

- 当前 v5 草案池有 23 条出版资料题及 3 条合成安全题；NTIA 是其中唯一一条该报告题。另 22 条出版题中没有相同题面或 `G117`、`ISS`、`NTIA` 字样。人工逐题比较未见另一条询问该报告的业务分类、联邦中继脚注和非联邦优先级组合。
- 发现前定向仓库文字、忽略的本地文字、历史 Gold 和资料库精确哈希筛查没有报告专有命中；这不能排除语义近重复、未记录的提示、二进制资料或提供方侧暴露。NTIA/NASA 报告暂按单一发布家族计，不与 FCC、ETSI 或 NIST 混作多个该报告来源。
- 原件 9 个视觉候选页在隔离克隆已审核并私有登记，目标证据块可回读，跨账号读取被拒；尚未验用户可见的真实模型回答与引用。资料只准用于有出处的短事实转述和内部候选审核，整份 PDF/页面图片再分发未获批准。
- 当前没有全套来源/题义污染终审、经用户审核的本新类型 Gold、G15 运行冻结或 G16 真实双路结果。**本 NTIA 题获批 Gold 为 0；截至本次复核，GOV.UK 工作簿家族另有 3 题作为 1 个私有暴露单元获批 Gold**，仍未构成完整冻结题集。见[GOV.UK 家族判决](evidence/ma24-g14-govuk-family-gold-disposition-2026-10-15.json)。

审核时请判断候选答案是否忠于这两页、是否保持“建议而非已生效”边界，以及这一新题型是否适合纳入 G14 独立题集。若需修改，记录修订后的题面/答案与原件坐标，再重新做题池重叠和冻结哈希。

有界检查收据：[NTIA 新题型审核准备](evidence/ma24-g14-ntia-new-type-review-packet-2026-10-15.json)。
