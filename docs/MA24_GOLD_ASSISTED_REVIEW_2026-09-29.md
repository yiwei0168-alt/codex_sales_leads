# MA24 对话辅助 Gold 审核

## 工作方式

用户 2026-09-29 要求助手在当前对话逐题读取来源、提出候选答案，由用户选择、评价或修改。只有逐题明确确认后才调用现有 `saveGoldReview` 保存。候选生成不是人工确认；holdout 保持锁定，不用于调参。

## 已确认并保存

| 题目 | 用户决定 | 保存结果 | 来源 |
| --- | --- | --- | --- |
| `base-01-open`：打开 AP3000 的 datasheet | 用户明确选择“确认答案和来源” | 修订 r2；当前题目哈希 `f7572246c87023b6ba5f9751176c53f38bf3719338708dde287cd2e94b94c72a`；数据库回读一致 | 《AP3000_P / AP3000 Datasheet V1.0》，第 1 页；来源 SHA-256 `88447950d61dbdb5b2d2ed370fc30fa60db5cf68f323e3161d02fbdde58a8bff`；v3 块 `c66fe6e0-d27b-4aa7-a46b-cafc14032be7`；短引 `Model: AP3000/AP3000_P` |
| `base-01-ports`：AP3000 有几个物理网口？ | 用户明确选择“确认答案和来源” | 修订 r2；当前题目哈希 `60807844d44aa1c5e265cf8db58f54432788b039aaa8111bf43f7f201d260fae`；数据库回读一致 | 同一原件第 3 页；v3 块 `4c614802-2bbb-45af-bbdd-1e94afd635fb` 短引 `1× Shielded 2.5GbE PoE IN`；块 `33139040-25cf-419f-b49d-adc52157a4f2` 短引 `2.5G RJ45 Ports. , 2 = 1.` |
| `base-01-poe`：AP3000 是否支持 PoE？ | 用户明确选择“确认答案和来源” | 修订 r2；当前题目哈希 `22403960d9f0e60df6040548bb13bd0eafce6d3eb3b8546e96092fd78bc7d1f1`；数据库回读一致 | 同一原件第 4 页，块 `fe66d7bf-29ae-44fa-96f5-cfb47caff0a2` 短引 `Passive PoE: 48 ~ 57V ⎓. , 1 = . , 2 = PoE: 802.3at/af.`；第 3 页块 `4c614802-2bbb-45af-bbdd-1e94afd635fb` 短引 `1× Shielded 2.5GbE PoE IN` |
| `base-01-compare`：比较 AP3000 和 AP3600 的接口与供电规格 | 用户先确认 r2，完整读取原件后明确确认修订 | 当前 r3；题目哈希 `9933ffa0d8f46b2adb50b4d294b339064815b650b073cd4dd7b0ebb5859ccd15`；数据库回读 8 条来源坐标 | AP3000 同一原件第 3、4 页；AP3600 Datasheet V1.0，SHA-256 `ead506a918429a4680d09990d82c1d4a64468ca39f02793677a213693638e466`；保留 r2 的六条接口/供电短引，补入两份第 3 页的端口方向原文 |
| `base-01-explain`：AP3000 适合什么部署场景？请说明依据 | 用户明确选择“确认答案和来源” | 修订 r2；题目哈希 `9570710b0f682588f8437842b8e071bca45f7a724ff9b1e9986fee70055cdb37`；数据库回读一致 | AP3000 同一原件第 3 页；块 `4c614802-2bbb-45af-bbdd-1e94afd635fb` 中场景、墙面/吸顶安装及 PoE IN 原文；块 `33139040-25cf-419f-b49d-adc52157a4f2` 短引 `Actual WiFi range may vary depending on layout and wall materials.` |
| `base-02-open`：Open the original datasheet for AP3600 | 用户明确选择“确认答案和来源” | 修订 r2；题目哈希 `e33c7defbc6eddc1062d3b4aff569703c5a73064e86c48c6ee303fefa1b50233`；数据库回读一致 | AP3600 Datasheet V1.0（SHA-256 同第四题），第 1 页，块 `541b981b-6255-4f8f-907f-8a87e75f8def`，短引 `Model: AP3600` |
| `base-02-ports`：How many physical Ethernet ports does AP3600 have? | 用户明确选择“确认答案和来源” | 修订 r2；题目哈希 `902836ee76863deb6677f9b1acdad93162aaed9e9dc76ea91def9365c5a8ae7f`；答案和来源数据库回读一致 | AP3600 Datasheet V1.0 第 3 页，块 `5721d364-98ab-48dc-9df3-46e45240eddb`，短引 `2.5G RJ45 Ports. Interfaces, 2 = 1. , 1 = Gigabit RJ45 Ports. , 2 = 1.`；总数由两项相加得到 |
| `base-02-poe`：Does AP3600 support PoE? | 用户先确认 r2，完整读取原件后明确选择“确认修订答案和来源” | 当前 r3；题目哈希 `34fbc4918a95a796f4029c7d421e48b562ab303eb7c9aef0392e70198540dc8f`；答案和 2 条来源数据库回读一致 | 保留第 4 页供电表；新增第 3 页块 `4a04741b-fb5a-40b3-a37e-26ee4602802b`，短引 `1× Shielded 2.5GbE PoE IN` 与 `1× Shielded GbE PoE Out` |
| `base-02-compare`：Compare the interfaces and power options of AP3600 and AP3000 | 用户先确认 r2，完整读取原件后明确确认修订 | 当前 r3；题目哈希 `a28309cb46120ca627b1d616874690acf0a07dd3690bcadaba6241118a9444fb`；答案和 8 条来源数据库回读一致 | 与第 4 题相同的两份原件第 3、4 页；新增 AP3600 第 3 页块 `4a04741b-fb5a-40b3-a37e-26ee4602802b` 的 PoE IN/Out 原文、AP3000 第 3 页块 `4c614802-2bbb-45af-bbdd-1e94afd635fb` 的 PoE IN 原文；全部重新匹配当前来源 |
| `base-02-explain`：Which deployment scenarios fit AP3600, and why? | 用户明确选择“确认答案和来源” | 当前 r2；题目哈希 `a08b941956ef054c2d49947fc86ebf7fff78e0d9a53d5bf9f71252c806f327b7`；数据库回读 3 条来源坐标 | AP3600 第 3 页 Highlights 块 `4a04741b-fb5a-40b3-a37e-26ee4602802b` 中场景、安装、Wi-Fi 7 和 PoE IN/Out 原文；规格表块 `5721d364-98ab-48dc-9df3-46e45240eddb` 中范围随布局/墙材变化的原文；整页原件已核对 |
| `base-03-open`：打开 AP6500 的 datasheet | 用户明确选择“确认答案和来源” | 当前 r2；题目哈希 `6a2d99350a026acd3e1207919489f6a2eb1e3e7d848ba7efad37e0e9a1ed8596`；答案与来源数据库回读一致 | AP6500 Datasheet V1.0 第 1 页，来源 SHA-256 `3e342d856d0a1cbe0f5018e70a71f50c93a82bcbb74e55617f06dddf33b4b2d9`，块 `4a86a2bc-5b79-41f4-9c85-82a399f9afd9`，短引 `Model: AP6500`；原件封面和哈希已核对 |
| `base-03-ports`：AP6500 有几个物理网口？ | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `8d64a087078f5e72ff5993fdb37d8e71f4a299601b0a1411030af71363d833d1`；数据库回读 2 条来源坐标 | AP6500 同一原件第 3 页，表格块 `cb78feb9-9476-4797-8067-53690bfdca49` 的 RJ45/SFP+ 数量；概述块 `cb3f1394-1dc4-48a9-9f37-c3a3e8bb2023` 短引 `1× Shielded 2.5GbE PoE IN, 10G SFP+ Slot`；整页原件已核对 |
| `base-03-poe`：AP6500 是否支持 PoE？ | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `2f06d3737998aa20e0250d577f450fc0511becde2600687054dddee2a7cb8132`；数据库回读 2 条来源坐标 | AP6500 第 3 页概述块 `cb3f1394-1dc4-48a9-9f37-c3a3e8bb2023` 的 PoE IN 标注；第 4 页表格块 `f354957f-436a-4e93-813a-3c26ac8a7b52` 的 Power Input/802.3at/af/48-57V 原文；不把适配器 Output 当作设备输出 |

该题已确认答案：找到并展示 AP3000 的原始 Datasheet PDF，提供打开或下载入口。已登记原件《AP3000_P / AP3000 Datasheet V1.0》包含 AP3000，可作为正确结果；不以 AP3000S 或 AP3000 Wall 等其他型号替代，也不把请求改成参数问答。

第二题已确认答案：AP3000（V1.0）有 1 个物理以太网口，为支持 PoE 输入的 2.5GbE RJ45 接口。DC 电源插孔不计作网口。

第三题已确认答案：支持。AP3000（V1.0）支持通过以太网口接受 PoE 供电，规格表列出 802.3at/af PoE 和 48～57V Passive PoE。这是 PoE 输入，不能据此声称它能向其他设备输出 PoE。

第四题 r2 历史答案（已由 r3 替代）：两者均按 V1.0 Datasheet：AP3000 有 1 个 2.5GbE RJ45 网口，DC 输入 12V / 1.5A，最大功耗 12W；AP3600 有 2 个 RJ45 网口（1 个 2.5GbE、1 个千兆），DC 输入 12V / 1A，最大功耗 10W。两者都支持 DC、802.3at/af PoE 输入及 48～57V Passive PoE 输入；上述资料不能据此证明支持 PoE 输出。未对适配器随箱配置作结论。

第四题 r3 已确认修订答案：两者均按 V1.0 Datasheet。AP3000 有 1 个标注 PoE IN 的 2.5GbE RJ45 网口，DC 输入 12V/1.5A，最大设备功耗 12W。AP3600 有 2 个 RJ45 网口：1 个 2.5GbE PoE IN、1 个千兆 PoE Out；DC 输入 12V/1A，最大设备功耗 10W。两者都支持 DC、802.3at/af PoE 输入及 48～57V Passive PoE 输入。不能把 AP3600 的端口标签或 10W 设备功耗当作其 PoE 输出标准、输出功率预算。

第五题已确认答案：AP3000（V1.0）适合交通枢纽、酒店、办公室、报告厅和教室等场所的墙面或吸顶无线覆盖。依据是 Datasheet 明确列出这些场景，且设备支持墙面/吸顶安装、Wi-Fi 6、2.5GbE 有线上联及 PoE 输入供电。实际覆盖应结合布局、墙体和终端数量评估，不能把宣传的覆盖面积直接当作保证。

第六题已确认答案（保持英文）：Find and display the original AP3600 Datasheet PDF, with an open or download link. The registered “AP3600 Datasheet V1.0” is a valid matching original. Do not substitute a different model or turn this request into a specification answer.

第七题已确认答案（保持英文）：AP3600 (V1.0) has 2 physical Ethernet ports: one 2.5GbE RJ45 port and one Gigabit RJ45 port. The DC power jack is not an Ethernet port.

第八题 r2 历史答案（已由 r3 替代）：Yes. AP3600 (V1.0) supports PoE input via an Ethernet port. Its datasheet lists IEEE 802.3at/af PoE and 48–57V Passive PoE. This is input power support; the cited specifications do not establish PoE output capability.

第八题 r3 已确认修订答案：Yes. AP3600 (V1.0) supports PoE input via its 2.5GbE Ethernet port. Its power specifications list IEEE 802.3at/af PoE and 48–57V Passive PoE input. The datasheet also explicitly lists one Gigabit PoE Out port. Do not infer the output standard or power budget from the port label alone.

第九题 r2 历史答案（已由 r3 替代）：Using their V1.0 datasheets, AP3600 has two RJ45 Ethernet ports (one 2.5GbE and one Gigabit), a 12V/1A DC input, and a maximum power consumption of 10W. AP3000 has one 2.5GbE RJ45 port, a 12V/1.5A DC input, and a maximum power consumption of 12W. Both support DC, IEEE 802.3at/af PoE input, and 48–57V Passive PoE input. These specifications do not establish PoE output capability.

第九题 r3 已确认修订答案：Using their V1.0 datasheets, AP3600 has two RJ45 Ethernet ports (one 2.5GbE PoE IN and one Gigabit PoE Out), a 12V/1A DC input, and a maximum device power consumption of 10W. AP3000 has one 2.5GbE RJ45 port labeled PoE IN, a 12V/1.5A DC input, and a maximum device power consumption of 12W. Both support DC, IEEE 802.3at/af PoE input, and 48–57V Passive PoE input. Do not infer AP3600’s PoE output standard or output power budget from the port label or its device power consumption.

第十题已确认答案：AP3600 (V1.0) is intended for malls, offices, campuses and other high-density Wi-Fi deployments. The datasheet identifies wall/ceiling mounting, dual-band Wi-Fi 7, a 2.5GbE PoE IN port and a Gigabit PoE Out port. Actual coverage depends on layout and wall materials; the stated coverage area and client count should not be treated as guaranteed deployment capacity.

第十一题已确认答案：找到并展示 AP6500 的原始 Datasheet PDF，提供打开或下载入口。已登记的《AP6500 Datasheet V1.0》是正确匹配的原件；不以 AP11000 等其他型号替代，也不把打开资料的请求改成参数问答。

第十二题已确认答案：AP6500（V1.0）有 1 个 2.5GbE RJ45 网口（支持 PoE 输入），另有 1 个 10G SFP+ 插槽。按 RJ45 网口统计为 1 个；若把 SFP+ 插槽也计为物理网络接口，则共 2 个。不能写成 2 个 RJ45 网口。本题解释统计口径，不新增全局网口定义。

第十三题已确认答案：支持。AP6500（V1.0）的 2.5GbE RJ45 网口支持 PoE 输入供电；规格表列出 802.3at/af PoE 和 48～57V Passive PoE。上述条目说明输入供电，不能据此声称设备支持 PoE 输出。

## 原件补充与逐题更正

准备第 10 题时完整读取 AP3600 第 3 页，发现 Highlights 明确列出 `1× Shielded GbE PoE Out`。随后核对两份本地 PDF SHA-256 与已登记哈希一致，并渲染查看两份原件完整第 3、4 页，确认输出说明、接口数量与输入供电/设备功耗。此前第 4、8、9 题只引用接口表与供电表，遗漏了概述中的输出口证据；其“不据此确定输出”的结尾需要补充。用户分别明确确认第 8、9、4 题修订后均保存为 r3，原 r2 决定保留在本记录。此次补充已完成；精确来源计数仍不替代剩余题目的人工答案与质量对照。

## 验证与进度

本机保存通过当前来源/版本/短引校验，第 4、8、9 题当前 r3，其他前十一题当前 r2，第十二、十三题当前 r1。第十三题保存后的只读审计为 development 已保存 13/190、精确来源 13/190；validation 0/60；holdout 0/50。前十一题补充历史记录，随后两题为新增审核。第十四题候选已提出，等待用户逐题确认，未写入 Gold。

审核发现存量共享树用 `v3ChunkId` 而非新上传的 `blockId`。预览与保存现在统一优先 `blockId`、其次 `v3ChunkId`、最后当前节点 ID；本机原文探针、9 项复核单测与局部 ESLint 通过。此兼容修复不修改来源内容或重建树。
