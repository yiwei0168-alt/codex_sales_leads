# MA24 对话辅助 Gold 审核

## 工作方式

用户 2026-09-29 要求助手在当前对话逐题读取来源、提出候选答案，由用户选择、评价或修改。只有逐题明确确认后才调用现有 `saveGoldReview` 保存。候选生成不是人工确认；holdout 保持锁定，不用于调参。

## 已确认并保存

| 题目 | 用户决定 | 保存结果 | 来源 |
| --- | --- | --- | --- |
| `base-01-open`：打开 AP3000 的 datasheet | 用户明确选择“确认答案和来源” | 修订 r2；当前题目哈希 `f7572246c87023b6ba5f9751176c53f38bf3719338708dde287cd2e94b94c72a`；数据库回读一致 | 《AP3000_P / AP3000 Datasheet V1.0》，第 1 页；来源 SHA-256 `88447950d61dbdb5b2d2ed370fc30fa60db5cf68f323e3161d02fbdde58a8bff`；v3 块 `c66fe6e0-d27b-4aa7-a46b-cafc14032be7`；短引 `Model: AP3000/AP3000_P` |
| `base-01-ports`：AP3000 有几个物理网口？ | 用户明确选择“确认答案和来源” | 修订 r2；当前题目哈希 `60807844d44aa1c5e265cf8db58f54432788b039aaa8111bf43f7f201d260fae`；数据库回读一致 | 同一原件第 3 页；v3 块 `4c614802-2bbb-45af-bbdd-1e94afd635fb` 短引 `1× Shielded 2.5GbE PoE IN`；块 `33139040-25cf-419f-b49d-adc52157a4f2` 短引 `2.5G RJ45 Ports. , 2 = 1.` |
| `base-01-poe`：AP3000 是否支持 PoE？ | 用户明确选择“确认答案和来源” | 修订 r2；当前题目哈希 `22403960d9f0e60df6040548bb13bd0eafce6d3eb3b8546e96092fd78bc7d1f1`；数据库回读一致 | 同一原件第 4 页，块 `fe66d7bf-29ae-44fa-96f5-cfb47caff0a2` 短引 `Passive PoE: 48 ~ 57V ⎓. , 1 = . , 2 = PoE: 802.3at/af.`；第 3 页块 `4c614802-2bbb-45af-bbdd-1e94afd635fb` 短引 `1× Shielded 2.5GbE PoE IN` |
| `base-01-compare`：比较 AP3000 和 AP3600 的接口与供电规格 | 用户明确选择“确认答案和来源” | 修订 r2；题目哈希 `9933ffa0d8f46b2adb50b4d294b339064815b650b073cd4dd7b0ebb5859ccd15`；数据库回读 6 条来源坐标 | AP3000 同一原件第 3、4 页；AP3600 Datasheet V1.0，SHA-256 `ead506a918429a4680d09990d82c1d4a64468ca39f02793677a213693638e466`，第 3 页块 `5721d364-98ab-48dc-9df3-46e45240eddb`，第 4 页块 `71ad09bb-5a2d-49c3-8bfb-4f65adf30b15`；各短引已保存至 `expected_sources` 并通过原文匹配 |
| `base-01-explain`：AP3000 适合什么部署场景？请说明依据 | 用户明确选择“确认答案和来源” | 修订 r2；题目哈希 `9570710b0f682588f8437842b8e071bca45f7a724ff9b1e9986fee70055cdb37`；数据库回读一致 | AP3000 同一原件第 3 页；块 `4c614802-2bbb-45af-bbdd-1e94afd635fb` 中场景、墙面/吸顶安装及 PoE IN 原文；块 `33139040-25cf-419f-b49d-adc52157a4f2` 短引 `Actual WiFi range may vary depending on layout and wall materials.` |

该题已确认答案：找到并展示 AP3000 的原始 Datasheet PDF，提供打开或下载入口。已登记原件《AP3000_P / AP3000 Datasheet V1.0》包含 AP3000，可作为正确结果；不以 AP3000S 或 AP3000 Wall 等其他型号替代，也不把请求改成参数问答。

第二题已确认答案：AP3000（V1.0）有 1 个物理以太网口，为支持 PoE 输入的 2.5GbE RJ45 接口。DC 电源插孔不计作网口。

第三题已确认答案：支持。AP3000（V1.0）支持通过以太网口接受 PoE 供电，规格表列出 802.3at/af PoE 和 48～57V Passive PoE。这是 PoE 输入，不能据此声称它能向其他设备输出 PoE。

第四题已确认答案：两者均按 V1.0 Datasheet：AP3000 有 1 个 2.5GbE RJ45 网口，DC 输入 12V / 1.5A，最大功耗 12W；AP3600 有 2 个 RJ45 网口（1 个 2.5GbE、1 个千兆），DC 输入 12V / 1A，最大功耗 10W。两者都支持 DC、802.3at/af PoE 输入及 48～57V Passive PoE 输入；上述资料不能据此证明支持 PoE 输出。未对适配器随箱配置作结论。

第五题已确认答案：AP3000（V1.0）适合交通枢纽、酒店、办公室、报告厅和教室等场所的墙面或吸顶无线覆盖。依据是 Datasheet 明确列出这些场景，且设备支持墙面/吸顶安装、Wi-Fi 6、2.5GbE 有线上联及 PoE 输入供电。实际覆盖应结合布局、墙体和终端数量评估，不能把宣传的覆盖面积直接当作保证。

## 验证与进度

本机保存通过当前来源/版本/短引校验，前五题数据库回读均为 r2。第五题保存后的只读审计为 development 已保存 11/190、精确来源 5/190；validation 0/60；holdout 0/50。五题均补充历史记录，未额外增加已保存题数。

审核发现存量共享树用 `v3ChunkId` 而非新上传的 `blockId`。预览与保存现在统一优先 `blockId`、其次 `v3ChunkId`、最后当前节点 ID；本机原文探针、9 项复核单测与局部 ESLint 通过。此兼容修复不修改来源内容或重建树。
