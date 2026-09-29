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
| `base-03-compare`：比较 AP6500 和 AP11000 的接口与供电规格 | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `a253a1f53b055d1a137f21b96b8bee1debef0ab800deb1b8e18a28bff90a8156`；数据库回读 8 条来源坐标 | AP6500 同一原件第 3、4 页的接口、PoE IN、输入供电与 18W 原文；AP11000 Datasheet V1.0，SHA-256 `40120eb39aad69e586784f6cec7b0c5caf40331fa24e4bb4525badeb706879e4`，第 2 页块 `cc3241ae-27ef-4cc2-8ebf-9aacce32834f` 的 PoE In、第 3 页块 `60465d7b-f656-4272-9d97-8aa45845def2` 的接口/供电/20W 原文；相关整页与登记哈希均已核对 |
| `base-03-explain`：AP6500 适合什么部署场景？请说明依据 | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `a4395881a42748c736c97efa8a3b516cb39a39b2bc6b7b331bc69e9c175c77e7`；数据库回读 2 条来源坐标 | AP6500 第 3 页概述块 `cb3f1394-1dc4-48a9-9f37-c3a3e8bb2023` 的场景/安装/接口/功能原文；表格块 `cb78feb9-9476-4797-8067-53690bfdca49` 的开放空间测试及布局/墙材条件；整页原件已核对 |
| `base-04-open`：Open the original datasheet for AP11000 | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `4c73d751d2c77277fbd02027c2f628795afd17e377a44076ca6766ad475c5adb`；答案与来源数据库回读一致 | AP11000 Datasheet V1.0 第 1 页，SHA-256 同第十四题，块 `c8f790cd-cb49-440d-a21b-bbf031bf43e6`，短引 `Model: AP11000`；封面原件与登记哈希已核对 |
| `base-04-ports`：How many physical Ethernet ports does AP11000 have? | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `71a209c145d93f24cb330cdb0259152cab512850b7e45a09cc1c3daa74e9ed72`；数据库回读 2 条来源坐标 | AP11000 第 3 页块 `60465d7b-f656-4272-9d97-8aa45845def2` 的 RJ45/SFP+ 数量及 accepts PoE powering；第 2 页块 `cc3241ae-27ef-4cc2-8ebf-9aacce32834f` 的 PoE In 标注；整页原件已核对 |
| `base-04-poe`：Does AP11000 support PoE? | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `18fd62d2dcca796522eb1fea98386c08b532f2e57a9e9a481bdacc26cb8a9bcc`；数据库回读 2 条来源坐标 | AP11000 第 2 页块 `cc3241ae-27ef-4cc2-8ebf-9aacce32834f` 的 PoE In 标注；第 3 页块 `60465d7b-f656-4272-9d97-8aa45845def2` 的 Power Input/802.3at/48~57V 原文；不额外推定 802.3af 或设备 PoE 输出 |
| `base-04-compare`：Compare the interfaces and power options of AP11000 and AP6500 | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `3efc4cc234c44b71d69a26fc4fd664b04fa0c07d4d8984f11f584d30990137b0`；数据库回读 8 条来源坐标 | 两份 V1.0 原件，与第十四题相同的 8 条接口、PoE 方向、输入供电及最大设备功耗坐标；重新通过当前来源/版本/短引校验 |
| `base-04-explain`：Which deployment scenarios fit AP11000, and why? | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `a7dfd37b74680037a94cddb50b4b6c45d95b4f02ba7ca1502036dd4a1267f823`；数据库回读 4 条来源坐标 | AP11000 第 2 页 Highlights 块 `cc3241ae-27ef-4cc2-8ebf-9aacce32834f` 与 Range 块 `aa6217b6-5d85-4872-8acb-15a2c6d442ca`；第 3 页 Installation 块 `167d7dbc-6b43-483d-8a96-afa6e548aa55`；第 4 页 Mesh/Wired Backhaul 块 `a497e2f8-8767-4fd4-ab3f-f8094324bfaa`；相关整页已核对，明确场景判断是根据规格推断 |
| `base-05-open`：打开 GS108 的 datasheet | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `7edfb6cf1a812f7d0892e344d2b8e86f15709dad0cc2f2b3715faa48e12db559`；答案与来源数据库回读一致 | GS108 Datasheet V5.0 第 1 页，来源 SHA-256 `87b2d44905b2d3f85fee9c89940cc461057c0d9568297e4b9eaa43a2b440704b`，块 `0f8f16e1-1429-48a4-9ca1-87a8df069ddd`，短引 `Model: GS108`；封面原件与登记哈希已核对 |
| `base-05-ports`：GS108 有几个物理网口？ | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `e49f784a248c7d977c4810499e3bdd676c7328ef859cb26beda1e8e7e7b02385`；数据库回读 2 条来源坐标 | GS108 第 2 页 Features 块 `322b34be-5987-48de-91b9-d66517c45865` 与规格表块 `eca2c0cd-0d72-4ffc-95ea-c2991c76635c` 的 8×10/100/1000Mbps、自动协商及 Auto-MDI/MDIX 原文；原件两页与封面设备图已核对 |
| `base-05-poe`：GS108 是否支持 PoE？ | 用户先选择“修改答案或来源”，随后明确修改：“未声明是否支持POE就是不支持” | 当前 r1；题目哈希 `ae0a16249c71267aeb39f4d83a03dbe55616c523ed6db2d2011acd5ff365783c`；数据库回读 2 条来源坐标 | GS108 第 2 页规格表块 `eca2c0cd-0d72-4ffc-95ea-c2991c76635c`，短引 `Power. Power, 2 = DC 5V / 0.55 A.` 及协议栏 `IEEE 802.3, 802.3i/u/x/ab`；两页原件无 PoE 声明，按用户 MA24-09 口径判定不支持 |
| `base-05-compare`：比较 GS108 和 GS108D 的接口与供电规格 | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `ec88d4813e93d5249cdd7e35c6601aa1b7178b548f33e37c41fe5f9eb5ff5ef9`；数据库回读 6 条来源坐标 | GS108 同一原件第 2 页接口/供电/功耗；GS108D Datasheet V5.0，来源 SHA-256 `7ddd8a2345ff52e07b5091deaa1341eaa4f6afb7fce1e69a7dc0e96dea063cf5`，第 2 页规格表块 `52180363-c68a-4962-82c6-c7804acc4c3a` 与 Features 块 `051ca744-6e56-45f0-b4ed-a5af8c770d00`；两份完整原件与哈希已核对，PoE 按 MA24-09 判为不支持 |
| `base-05-explain`：GS108 适合什么部署场景？请说明依据 | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `8430699b724ef7b96587d6ea1cc3c46ab227b49641dc374dd2945f47cb2ab15c`；数据库回读 2 条来源坐标 | GS108 第 2 页 Features 块 `322b34be-5987-48de-91b9-d66517c45865` 的接口、安装、流控、IGMP、环路和功耗原文；规格表块 `eca2c0cd-0d72-4ffc-95ea-c2991c76635c` 的 DC 供电原文；部署判断注明来自规格，PoE 按 MA24-09 判定 |
| `base-06-open`：Open the original datasheet for GS108D | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `1b6769748fa5a4fbb584090d427f8ff57949911b286df120b2d7ed88550603c8`；答案与来源数据库回读一致 | GS108D Datasheet V5.0 第 2 页，来源 SHA-256 同第二十四题，规格表块 `52180363-c68a-4962-82c6-c7804acc4c3a`，短引 `Product Model. Product Model, 2 = GS108D.`；封面型号可见但无对应抽取块，使用第 2 页真实块坐标 |
| `base-06-ports`：How many physical Ethernet ports does GS108D have? | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `2ad9cfc38eb0a3dabb989a47d5e186bcbec2080125d7ef9c84748f190d08923f`；数据库回读 2 条来源坐标 | GS108D 同一原件第 2 页 Features 块 `051ca744-6e56-45f0-b4ed-a5af8c770d00` 与规格表块 `52180363-c68a-4962-82c6-c7804acc4c3a` 的 8×10/100/1000Mbps、自动协商及 Auto-MDI/MDIX 原文；独立 DC 插孔不计入网口 |
| `base-06-poe`：Does GS108D support PoE? | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `214b9ff37fa75f39c90d238c5bc3ed98ca0dcdc5b5e7e0886021f5f2681204d7`；数据库回读 2 条来源坐标 | GS108D 同一原件第 2 页规格表块 `52180363-c68a-4962-82c6-c7804acc4c3a` 的 Input Voltage/DC 5V/0.55A 和协议原文；两页原件无 PoE 声明，按已确认 MA24-09 判定不支持输入或输出 |
| `base-06-compare`：Compare the interfaces and power options of GS108D and GS108 | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `4b1b6a404cbfc6b314c8e1b7d2c4770f2f514b1b4d297bb0ef4d9b2a1b80ef1e`；数据库回读 6 条来源坐标 | 两份 V5.0 原件，与第二十四题相同的第 2 页接口、供电及功耗原文块，按英文题目保存确认的英文答案；全部重新通过当前来源/短引校验 |
| `base-06-explain`：Which deployment scenarios fit GS108D, and why? | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `60182e561d4d5ef40d6d37e553462d88e372a214bf27e8d0e3be67224df5b456`；数据库回读 2 条来源坐标 | GS108D 第 2 页 Features 块 `051ca744-6e56-45f0-b4ed-a5af8c770d00` 的接口、安装、流控、IGMP、环路及功耗原文；规格表块 `52180363-c68a-4962-82c6-c7804acc4c3a` 的 DC 供电原文；部署判断来自规格，PoE 按 MA24-09 判定 |
| `base-07-open`：打开 GS1010PE 的 datasheet | 用户明确选择“确认答案和来源” | 当前 r1；题目哈希 `be0e7acc4d9658bfdfd2ed70b160448786e8b2e617df34807ee70d7196707676`；答案与来源数据库回读一致 | GS1010PE Datasheet V2.0，来源 SHA-256 `982a55ff4872c8033e9a039309eadea5842db7ef9fa80f582f40182afe75e4d6`；封面可见型号但抽取块未保存，登记第 4 页块 `6f22d16b-9857-4f66-aade-96e126c3a589` 的 Package Content 短引 `GS1010PE / Power Cord / Installation Guide`；原件型号和哈希已核对 |

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

第十四题已确认答案：两者均按 V1.0 Datasheet。两者均有 1 个 2.5GbE RJ45 网口（PoE 输入）和 1 个 10G SFP+ 插槽，不能写成 2 个 RJ45 网口。AP6500：DC 输入 12V/1.5A，最大设备功耗 18W；PoE 输入规格列出 802.3at/af 和 48～57V Passive PoE。AP11000：DC 输入 12V/2A，最大设备功耗 20W；PoE 输入规格列出 802.3at 和 48～57V Passive PoE。该原件未列出 802.3af，不额外推定其支持情况。适配器的 Output 参数不代表设备具有 PoE 输出能力。

第十五题已确认答案：AP6500（V1.0）适合酒店等接待服务、教育和交通场所的高需求无线部署，支持墙面或吸顶安装。依据是 Datasheet 明确列出这些场景，并提供六流双频 Wi-Fi 7、1 个 10G SFP+ 插槽、1 个 2.5GbE PoE IN 网口，以及多 AP 管理、Captive Portal 和 VLAN SSID。实际覆盖受布局和墙体材料影响，不能把标称距离或连接设备数当作保证的部署容量。

第十六题已确认答案（保持英文）：Find and display the original AP11000 Datasheet PDF, with an open or download link. The registered “AP11000 Datasheet V1.0” is a valid matching original. Do not substitute AP6500 or another model, or turn this request into a specification answer.

第十七题已确认答案（保持英文）：AP11000 (V1.0) has one 2.5GbE RJ45 Ethernet port that accepts PoE input, plus one 10G SFP+ slot. The RJ45 port count is 1; counting the SFP+ slot as a physical network interface gives 2 interfaces in total. It does not have two RJ45 ports.

第十八题已确认答案（保持英文）：Yes. AP11000 (V1.0) supports PoE input through its 2.5GbE RJ45 Ethernet port. Its datasheet lists IEEE 802.3at PoE and 48–57V Passive PoE input. The cited original does not list 802.3af, so its support should not be inferred. Adapter output specifications do not establish PoE output capability of the AP itself.

第十九题已确认答案（保持英文）：Using their V1.0 datasheets, both AP11000 and AP6500 have one 2.5GbE RJ45 port for PoE input and one 10G SFP+ slot, not two RJ45 ports. AP11000 has a 12V/2A DC input and a maximum device power consumption of 20W; its PoE input specifications list IEEE 802.3at and 48–57V Passive PoE. AP6500 has a 12V/1.5A DC input and a maximum device power consumption of 18W; its PoE input specifications list IEEE 802.3at/af and 48–57V Passive PoE. AP11000’s cited original does not list 802.3af, so its support should not be inferred. Adapter output specifications do not establish PoE output capability of either AP.

第二十题已确认答案（保持英文）：Based on its documented features, AP11000 (V1.0) fits indoor wall/ceiling deployments that need tri-band Wi-Fi 7, multi-gigabit wired connectivity, or Mesh with wired backhaul. The datasheet lists 6-stream tri-band Wi-Fi 7, one 10G SFP+ slot, one 2.5GbE PoE input port, wall/ceiling mounting, and Cudy Mesh with wired backhaul. This is a feature-based deployment assessment; the cited pages do not explicitly name particular industries or sites. Actual indoor coverage depends on layout and wall materials, so stated range and client figures should not be treated as guaranteed capacity.

第二十一题已确认答案：找到并展示 GS108 的原始 Datasheet PDF，提供打开或下载入口。已登记的《GS108 Datasheet V5.0》是正确匹配的原件；不以 GS108D、GS108E、GS108ES2 或 GS108U 等其他型号替代，也不把打开资料的请求改成参数问答。

第二十二题已确认答案：GS108（V5.0）有 8 个物理以太网口，均支持 10/100/1000Mbps 速率、自动协商及 Auto-MDI/MDIX。DC 电源插孔不计作网口。

第二十三题用户明确修改后保存的答案：不支持。GS108（V5.0）采用 DC 5V/0.55A 供电，其 Datasheet 未声明 PoE 输入或输出支持。

第二十四题已确认答案：两者均按 V5.0 Datasheet。两者均有 8 个 10/100/1000Mbps 物理以太网口，支持自动协商及 Auto-MDI/MDIX；输入供电均为 DC 5V/0.55A，原件标称最大功耗 1.8W、空闲功耗 0.3W。两者均不支持 PoE 输入或输出。

第二十五题已确认答案：根据规格判断，GS108（V5.0）适合需要扩展千兆有线端口的桌面或壁挂部署。依据是 8 个 10/100/1000Mbps 网口、自动协商及 Auto-MDI/MDIX、桌面/壁挂安装、802.3x 流控、IGMP 多播支持和环路自动检测与阻断；原件标称最大功耗 1.8W、空闲功耗 0.3W。设备采用 DC 5V/0.55A 供电，不支持 PoE。原件未明确列举特定行业，上述部署判断来自接口与功能。

第二十六题已确认答案（保持英文）：Find and display the original GS108D Datasheet PDF, with an open or download link. The registered “GS108D Datasheet V5.0” is a valid matching original. Do not substitute GS108 or another model, or turn this request into a specification answer.

第二十七题已确认答案（保持英文）：GS108D (V5.0) has 8 physical Ethernet ports, all supporting 10/100/1000Mbps, auto-negotiation and Auto-MDI/MDIX. The DC power jack is not an Ethernet port.

第二十八题已确认答案（保持英文）：No. GS108D (V5.0) uses a DC 5V/0.55A power supply and does not support PoE input or output. Its datasheet does not declare PoE support.

第二十九题已确认答案（保持英文）：Using their V5.0 datasheets, both GS108D and GS108 have 8 physical 10/100/1000Mbps Ethernet ports with auto-negotiation and Auto-MDI/MDIX. Both use a DC 5V/0.55A power supply, with a stated maximum power consumption of 1.8W and idle consumption of 0.3W. Neither supports PoE input or output.

第三十题已确认答案（保持英文）：Based on its specifications, GS108D (V5.0) fits desktop or wall-mounted deployments that need more Gigabit wired ports. The datasheet lists 8 auto-negotiating 10/100/1000Mbps ports with Auto-MDI/MDIX, desktop/wall mounting, IEEE 802.3x flow control, IGMP multicast support, and automatic loop detection and blocking. Stated power consumption is 1.8W maximum and 0.3W idle. It uses a DC 5V/0.55A supply and does not support PoE. This deployment assessment is based on its features; the datasheet does not name particular industries.

第三十一题已确认答案：找到并展示 GS1010PE 的原始 Datasheet PDF，提供打开或下载入口。已登记的《GS1010PE Datasheet V2.0》是正确匹配的原件；不以其他型号替代，也不把打开资料的请求改成参数问答。

## 原件补充与逐题更正

准备第 10 题时完整读取 AP3600 第 3 页，发现 Highlights 明确列出 `1× Shielded GbE PoE Out`。随后核对两份本地 PDF SHA-256 与已登记哈希一致，并渲染查看两份原件完整第 3、4 页，确认输出说明、接口数量与输入供电/设备功耗。此前第 4、8、9 题只引用接口表与供电表，遗漏了概述中的输出口证据；其“不据此确定输出”的结尾需要补充。用户分别明确确认第 8、9、4 题修订后均保存为 r3，原 r2 决定保留在本记录。此次补充已完成；精确来源计数仍不替代剩余题目的人工答案与质量对照。

## PoE 审核口径更正

第二十三题最初候选只表述“原件未声明支持，不能答支持”，未写入 Gold。用户选择修改并明确要求“未声明是否支持POE就是不支持”，因此直接按其明确修改保存“不支持”的 r1，不将其误记为点击确认原候选。MA24-09 记录本轮 PoE 能力 Gold 的判定口径；GS108 两页完整原件及真实短引保留，否定结论不冒充原件逐字引文，也不表示进行过硬件测试。

## 验证与进度

本机保存通过当前来源/版本/短引校验，第 4、8、9 题当前 r3，其他前十一题当前 r2，第十二至三十一题当前 r1。第三十一题保存后的只读审计为 development 已保存 31/190、精确来源 31/190；validation 0/60；holdout 0/50。前十一题补充历史记录，随后二十题为新增审核。第三十二题候选已提出，等待用户逐题确认，未写入 Gold。

审核发现存量共享树用 `v3ChunkId` 而非新上传的 `blockId`。预览与保存现在统一优先 `blockId`、其次 `v3ChunkId`、最后当前节点 ID；本机原文探针、9 项复核单测与局部 ESLint 通过。此兼容修复不修改来源内容或重建树。
