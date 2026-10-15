# MA24 G14 ONS 5G 工作簿逐题审核包

状态：**内容待逐题审核；尚未批准独立 Gold。** 本包只涉及 `ons-5g-2026-highland-outdoor-denominator`。先前的 Highland／Scotland 百分点差草案与本题共用原件和 Highland 数值，已由本题替代，不另计独立题。本轮 Goal 止于 G16；G17–G20 暂停。

## 待审核题文和答案

**题文**：ONS《5G coverage》2026 年 1 月工作簿中，Highland 的 35.20% 表示什么覆盖指标？这份工作簿能否给出 Highland 的住户室内 5G 覆盖率？请引用指标定义与原始单元格。

**候选答案**：35.20% 表示截至 2026 年 1 月，Highland 地理面积中，室外达到至少一家运营商 5G 信号的比例；工作簿定义的信号强度阈值为 −110 dBm。它不是住户室内覆盖率。该工作簿没有提供 Highland 的住户室内 5G 覆盖率，不能从 35.20% 推算或用其代替这个值。

**限定**：这里只判断这份工作簿的内容，不断言其他来源没有住户室内覆盖率。题目属于“有数值答案，同时有资料不足的子问题”；不能把整题标为纯无答案题。

## 原件与产品证据

- [ONS 指标页](https://www.ons.gov.uk/explore-local-statistics/indicators/5g-coverage)所列工作簿的本地隔离副本为 `tmp/ma24-independent-quarantine/ons-5g-coverage-2026.xlsx`，SHA-256 为 `b488e723e475ce022fdf3d35bc1ead4611e58dda9cbf96371a6e7485834a6238`。2026-10-16 只读重算一致。
- 原件四表为 `Cover_sheet`、`Table_of_contents`、`Notes`、`1`。`Notes!B4` 明确写明室外、地理面积、至少一家运营商和 −110 dBm 阈值；`1!A5:C5` 是地区代码、地区名称及 `2026-01-01 (%)`；`1!A370:C370` 为 `S12000017`、`Highland`、`35.2`。四表逐格扫描 `indoor`、`household`、`premises`、`population` 文本均无命中；这只是对该原件的有界缺项复核。
- 2026-10-16 再次只读核原件：`1!C370` 的原始数值是 `35.2`，单元格格式为 `#,##0.0`。审核题中的 `35.20%` 数值相同，但正式冻结题文应采用原件的一位小数精度 `35.2%`。ONS 指标页与 Ofcom 再利用说明也已复查，见[本轮原件与来源收据](evidence/ma24-g14-ons-5g-current-original-and-source-use-2026-10-16.json)。
- 隔离产品上传、`Notes` 和数据证据块回读、另一账号拒读已经过检；坐标分别为 `sheet-3-table` 第 4 行和 `sheet-4-table` 第 370 行。现有验收仅覆盖产品抽取与权限，不覆盖真实模型答案和用户可见引用。[产品与草案收据](evidence/ma24-g14-ons-5g-notes-and-private-gold-draft-2026-10-15.json)、[私有候选](../tmp/ma24-independent-quarantine/ons-5g-highland-denominator-gold-draft-v1.json)。

## 独立性及来源边界

- 旧 350 行问题和当前出版物草案的本地近邻、题义复核未发现同一 Highland 室外地理面积数值及缺失住户室内值的题；这不能排除未记录的提示、二进制派生材料或提供方预训练。若后续产品按本来源调优回答或检索，应将整个 ONS 来源单元退出独立评分。[家族准备收据](evidence/ma24-g14-ons-5g-family-freeze-readiness-2026-10-15.json)。
- 原件标明 ONS 指标、Ofcom 底层数据。当前用途限定为带来源归属的私有短事实测评；整份工作簿再分发、机构标识使用，以及把此指标等同于其他 Ofcom 统计，均未在本审核包获批。[来源收据](evidence/ma24-g14-ons-5g-xlsx-candidate-2026-10-14.json)。
- **下一判定**：逐题确认上述题文、混合答案及限定；随后单独决定家族来源资格和独立 Gold、封存题文与来源快照。整套 G14 困难题覆盖、G15 付费准入和 G16 真实双路质量仍未完成。本包不改变现有 Gold 计数。
