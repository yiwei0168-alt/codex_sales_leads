# G03–G04 实际 Worker 串联（2026-10-19）

在另一套全新合成 156 数据库中，执行：

`npx tsx scripts/verify-ma24-fresh-pilot-new-cluster.ts --web-image=ma24-pilot-web:3b44c10c --current-schema --local-memory-worker --local-memory-graph-worker`

## 已验证

- 实际抽取 Worker 三次独立 `--once`，本机固定 Qwen 两次 chat 完成原偏好与自然纠正，第三次空队列退出。
- 同一批两条观察的实际图谱 Worker 三次独立 `--once`，前两次取 outbox 并 delivered，第三次空队列退出；两条记录 attempt_count 均为 1，投影后租约清空。
- 未替换两个 Worker 的生产处理函数或 Python projector；实际 Graphiti EntityNode/EntityEdge 保存到本机 Neo4j，使用 projector 所要求的固定 `nomic-embed-text` 服务 digest。图谱阶段不追加 Qwen chat。
- 正式事实/政策计数保持不变；两条通知/outbox 各一次。局部测试开关仅传给子进程，不修改正常环境。
- 图谱清理使用本次随机合成账号及两条观察 UUID，通过现有专用脚本逐条删除；不遍历/清空其他账号。图谱夹具身份留在本机 tmp 的 graph-fixture.json 供异常恢复；成功后数据库/Web/网络由父级临时环境清理。

[实际进程与源文件指纹收据](evidence/ma24-g03-g04-actual-worker-chain-2026-10-19.json)。类型及定向 lint 通过；原 G03 单独 Worker 收据保留。

## 边界与剩余

本次只有两个合成英文输入、六次有界 Worker 启动。没有代表性业务质量、持续调度/负载、当前串联流程中的 Web 操作、撤销/双时间或图谱检索验收。旧图候选过滤、故障降级及历史时间的服务级证据分别保留，不扩称为本次实际 Worker 的完整重验。

relay 的 tagCalls 只统计抽取 Worker 经 relay 的 tags 请求，图谱 projector 直接校验自己的本机嵌入服务；不把该数字当作所有图谱请求总数。服务声明的模型 digest 不等同权重/二进制认证。

G03/G04 整体及生产试点仍未完成，自动启用未放行。G09 固定 6770a547 完整联验在独立环境运行，本次通过不替代其结果。
