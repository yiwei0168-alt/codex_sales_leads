# MA24 G14 CanSat LoRa PPTX 逐题审核包

## 候选题和答案

候选题 `zenodo-lora-cansat-architecture-crc-storage` 询问 2026 年 CanSat LoRa 遥测方案第 13、15 页：传感器/GPS 数据经过哪些组件、CRC 在哪一步加入、发射后如何处理及保存数据。

候选答案：第 13 页的设计链路依次为传感器（GPS/BMP180）、微控制器（ESP32/Arduino）、LoRa 射频模块（SX127x）、地面站。第 15 页先读取传感器，再构造带 CRC 的数据包，发射 LoRa 帧，解码并交付载荷，最后显示并存为 CSV 或数据库。这两页描述设计流程，不证明外场实测已经完成。

## 原件与产品引用

- [候选来源记录](evidence/ma24-g14-zenodo-lora-cansat-pptx-candidate-2026-10-15.json)固定了 Zenodo 原件、SHA-256 `907049721a1359658787a026cbeace9b93be4879b75048b5c5a7debea51dedec` 和原页检查。
- [视觉对象审核](evidence/ma24-g14-zenodo-lora-visual-object-review-2026-10-15.json)逐一判定 38 个待审对象，其中第 13 页 3 条箭头和第 15 页 5 条箭头保留为方向证据。
- [隔离产品回读](evidence/ma24-g14-zenodo-lora-reviewed-citation-clone-2026-10-15.json)已保存全部判定，核对目标文字/箭头块，并验证另一账号不可读取。第 13 页目标文字块为 `slide-13-text-6/3/2/1`；第 15 页为 `slide-15-text-4/7/10/13/16`。
- 私有 Gold 草案位于 `tmp/ma24-independent-quarantine/zenodo-lora-cansat-gold-draft-v1.json`，SHA-256 `981535c1825980495ae7c719b85375d73ad11a4cc405ee9fbd6dfd4aec8280b7`。七个短摘录逐条通过原抽取块 ID、页码与文字核对；另记录八条视觉方向证据。它尚未冻结为 Gold。

## 审核边界

这一题属于新的 PPTX 图示流程问法，按 [MA24-10](CONFIRMED_PRODUCT_RULES.md)需先确认题目、答案和“设计而非实测”的限定。[家族冻结准备记录](evidence/ma24-g14-zenodo-lora-family-freeze-readiness-2026-10-15.json)已有旧题池、同轮题池和本机历史的有界筛查；它不能排除未记录提示、二进制派生或模型已有知识。用户逐题确认只保留候选资格，后续仍须决定家族独立性、封存来源和 Gold，并在 G16 核验真实双路答案与引用。目前没有模型回答调用，G17–G20 暂停。
