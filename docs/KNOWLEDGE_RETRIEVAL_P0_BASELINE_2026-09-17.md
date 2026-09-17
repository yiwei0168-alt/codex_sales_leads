# KQ01 P0：知识语料审计与离线评测基线

日期：2026-09-17。提交前状态：P0 已实施并验证；P1–P8 尚未实施。

## 实现

- `scripts/audit-knowledge-corpus.ts` 以 PostgreSQL `BEGIN READ ONLY`、应用角色和 owner tenant scope 读取聚合数据，并核对三份本地manifest及197份datasheet的源文件/处理文件存在性。输出不含知识正文、文件名列表、凭据或其他用户私有数据。
- `scripts/evaluate-knowledge.ts` 默认仅离线执行；显式 `--live` 在P0被拒绝。它冻结当前意图路由、四类事实提取错误和短章节标题丢失问题，不调用模型、embedding、搜索或SMTP。
- `src/lib/knowledge/evaluation/corpus.ts` 以确定性生成合同冻结160条基础请求及40条边界请求，覆盖32个主要型号种子、34个实体标识、四种目标动作、中英文、否定、单位边界、版本、上下文、未知实体和租户拒绝场景。WR3000相关请求不超过10条，没有产品答案硬编码。
- 新增 `npm run knowledge:audit` 和 `npm run knowledge:eval`；后者固定追加 `--offline`。

## 基线结果

- 评测语料：200条，SHA-256 `bbafb762e7fbb805192594c58b8ef0f4c80c0e92ec30fd6af9b319163b4df436`；当前确定性顶层路由200/200为 `knowledge-question`。这只验证入口大类，不代表未来四类知识动作已经识别。
- 缺陷均复现：2.5G误作5G蜂窝、SFP+退化为SFP、否定PoE/WPA3仍产生正事实、802.3af/at及120W组合提取不全、短Beta章节被并入Alpha标题。
- 当前共享语料：283文档、2,047片段且均有向量；3,054条旧结构化事实全部标verified。4份文档含无可提取文本占位，9个实体有多份datasheet。
- 本地产品manifest：270目录产品、197份datasheet、61份分类目录、14份参考资料；登记的原件和处理文件均存在，1个页面未出现在处理文本中，原因仍待P3分类。
- manifest hashes：product `1135222505f6931de29c8a16f73cd4605123c5fad2f8a0b0b1f117fbfe633f7a`；company `26df6314d2117d54d7d4030872e7dcc70865caade01456de042e42f71d9abf0e`；industry `74ec187613eaf4c17e63974a5e545890582cc0b3aa81f14837960da7597d4a9a`。

## 验证

- `npm.cmd test -- src/lib/knowledge/evaluation/corpus.test.ts src/lib/rag/product-facts.test.ts src/lib/rag/chunker.test.ts src/lib/assistant/intent.test.ts`：4文件、14项通过，538ms。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run knowledge:eval`：通过，200条语料与5类已知缺陷稳定。
- `npm.cmd run knowledge:audit`：通过，只读事务完成，模型/embedding/搜索/SMTP调用0。

P0没有修改生产数据库、知识正文、向量、事实或产品路由，也没有声称缺陷已修复。基础集中的事实答案仍需在P3/P4根据原件冻结；当前只冻结路由、实体、属性和安全预期，避免用旧错误事实生成gold answer。用户采用和未来节省未知。
