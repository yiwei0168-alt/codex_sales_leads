# G01/G02 最终保存的两种数据库提交结果

## 当前结果

既有 `--main-runtime-commit-loss` 验收扩展为同一次运行的两种实际 PostgreSQL 协议故障，退出 0。使用固定 `ma24-main-agent-runtime:96b7487e`，镜像 ID `sha256:054f9287cc72959d0da80a9d59a809c382292e664c31a5a60a6606b7e3a73204`，来源 `96b7487ea728bb2c47086c856f74ec7013fc1611`；产品镜像没有改写。

1. **数据库已提交，确认丢失**：上游真实返回 COMMIT 完成和空闲确认后，两包均被抑制并断连。任务仍 completed，原回答、一条消息、一条状态事件、一条提取任务保留，后续空队列 Worker 不重放。
2. **COMMIT 未送达，事务回滚**：实际最终保存事务的提取 INSERT 收到 `INSERT 0 1` 后，代理在收到 COMMIT 时直接关闭上游、不转发该包。原回答没有写入可见结果/助手消息，提取任务为 0；Worker 仅保存一次连接中断的安全 partial 状态、消息和事件。完成态 checkpoint 本身属于此前已持久化的恢复材料，不声称已删除。
3. 再运行一个实际空队列 Worker，partial 记录不变。随后创建新任务，经同一个实际 API 与编译 Worker 正常完成，消息/事件/提取各一份，验证 API 数据库连接池可继续使用。之前已提交和 partial 的任务记录均不变。

故障计数快照：目标 COMMIT 共 2 个，其中后端完成并丢弃确认 1 个、成功 INSERT 后阻止发送 1 个；协议失败 0。截至第二故障检查时，两侧分别有 7 个经验证 TLS 连接。临时 API/Worker/数据库/代理及网络清理完成，已有三个业务容器保留。

## 验证与执行范围

- TypeScript、三个相关脚本的定向 lint、代理语法及差异检查通过。
- 全新数据库迁移到 158，实际 LangGraph API、租约领取、编译 Worker、PostgreSQL checkpoint 恢复和持锁最终保存；有效/撤回来源基线同步通过。
- 代理继续使用临时证书、双侧 TLS 和上游主机名校验，不记录 SQL、参数、认证或私钥。控制入口仅在专用容器回环，数据库代理端口不发布到宿主或内网。
- 故障脚本和验收编排在本阶段源码中，固定产品包仍为旧版本；不把新增脚本或后续 G09 改动算入旧镜像。
- 全部使用合成完成态 checkpoint，实际模型调用 0、外部动作 0，无生产数据复制、人工质量结论、自动启用或部署。

[结构化终态及脚本/日志哈希](evidence/ma24-g01-g02-postgres-commit-outcomes-2026-10-20.json)。原先只覆盖已提交分支的证据和首次端口编排失败继续保留在[前一阶段](MAIN_AGENT_POSTGRES_COMMIT_ACK_LOSS_2026-10-20.md)，不改写为其他范围。

执行命令：

```text
node scripts/run-tsx.cjs scripts/verify-ma24-fresh-pilot-new-cluster.ts --web-image=ma24-pilot-web:96b7487e --current-schema --main-runtime-image=ma24-main-agent-runtime:96b7487e --main-runtime-commit-loss
```

## 剩余范围

本轮验证普通主任务最终保存的两种数据库提交结果及后续新任务连接恢复，没有验证中断任务的人工 resume、外部动作未知结果、首次真实模型业务、强制进程崩溃、异地一致恢复、目标负载或生产部署。G01/G02 整体仍未完成，G14–G20 和内网上线继续暂缓。
