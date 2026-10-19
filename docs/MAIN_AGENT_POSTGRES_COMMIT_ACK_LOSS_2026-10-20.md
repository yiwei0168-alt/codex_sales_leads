# G01/G02 实际 PostgreSQL COMMIT 确认丢失

后续同一固定运行镜像已补齐 COMMIT 未送达后的回滚分支、单次安全 partial、空队列不重放及同一 API 后续新任务的数据库连接恢复。[两种结果的终态](MAIN_AGENT_POSTGRES_COMMIT_OUTCOMES_2026-10-20.md)。下文保留本阶段仅覆盖已提交分支的原始范围。

## 验收机制

新增一次性验收参数 `--main-runtime-commit-loss`，必须配合 `--main-runtime-image`、`--web-image` 和 `--current-schema`。产品运行包不改写、不注入模型或存储适配器。专用代理在独立临时容器执行，应用与代理之间、代理与真实 PostgreSQL 之间都启用 TLS，证书及上游主机名校验保持有效。

协议处理依据 [PostgreSQL 16 消息格式](https://www.postgresql.org/docs/16/protocol-message-formats.html)及[查询消息流程](https://www.postgresql.org/docs/16/protocol-flow.html)。代理在实际最终保存事务插入记忆提取任务后，仅针对该事务的 COMMIT 启用一次故障。上游返回 `CommandComplete(COMMIT)` 和空闲态 `ReadyForQuery` 后，两包均不送达应用，连接关闭。因此本轮验证的是数据库实际完成提交、应用没有收到提交确认的分支。

代理不记录 SQL、绑定参数、认证或私钥。仅使用本轮临时数据库的 TLS 私钥，经进程 stdin 写入同 UID 的 0600 tmpfs 文件，加载后立即删除；私钥不进入 argv、环境变量、宿主文件或 Git。控制端口仅监听代理容器回环，数据库代理端口不发布到宿主/内网。代理不是产品托管方案。

## 实际结果

- 固定主运行镜像 `ma24-main-agent-runtime:96b7487e`，实际镜像 ID `sha256:054f9287cc72959d0da80a9d59a809c382292e664c31a5a60a6606b7e3a73204`，来源提交 `96b7487ea728bb2c47086c856f74ec7013fc1611`。
- 运行包 34,513 文件、非 root、只读根/包/Node、无 capabilities、no-new-privileges 及 NODE_OPTIONS 注入拒绝通过。
- 全新迁移 158 数据库，实际 API 和编译 Worker 的两个正反基线通过：有效共享来源完成，撤回来源保存安全 partial 且不建提取任务。第三个任务才启用 COMMIT 故障。
- 代理确认 4 个下游 TLS 连接与 4 个经验证上游 TLS 连接；目标 COMMIT、真实后端 COMMIT 完成、被抑制的完成包/空闲包及确认丢失计数各为 1，协议失败为 0。
- 真实 Worker 领取租约后，数据库确认丢失未覆盖已提交结果；任务仍 completed，原回答、助手消息、状态事件和提取任务均各一份。再运行一个实际编译 Worker 后记录不变，未重放任务。
- 实际模型调用 0、外部动作 0；使用合成完成态 checkpoint。临时 API/Worker/数据库/代理及网络已清理，仅保留原有三个业务容器。
- TypeScript、三个变更脚本的定向 lint、代理语法及差异检查均退出 0。

[结构化终态、脚本哈希和日志摘要](evidence/ma24-g01-g02-postgres-commit-ack-loss-2026-10-20.json)。验收脚本是本阶段工作区源码，运行产品镜像仍为上述固定旧版本；不声称镜像包含新增故障脚本或后续 G09 覆盖门槛。

## 首次失败与修复

首次验收在故障启用前 Worker 返回 `ECONNREFUSED`。API 使用 `--add-host` 将 `pilot-db` 映射到代理容器并使用 5540 端口；共享 API 网络/主机映射的 Worker 却仍使用原数据库 5432 端口。修正为 API/Worker 使用相同代理数据库 URL 后，同一不可变产品镜像重跑退出 0。首次失败日志保留，不改记为成功，两轮资源均已清理。

成功命令：

```text
node scripts/run-tsx.cjs scripts/verify-ma24-fresh-pilot-new-cluster.ts --web-image=ma24-pilot-web:96b7487e --current-schema --main-runtime-image=ma24-main-agent-runtime:96b7487e --main-runtime-commit-loss
```

## 未覆盖

本轮补齐“已提交但确认丢失”的实际数据库协议分支。COMMIT 未送达/回滚的另一结果分支、外部动作的未知提交、首次真实模型到最终保存、强制崩溃、异地一致恢复、目标负载和生产仍未验。原有 HTTP 响应丢失与正常状态卷重启属于独立证据。本地 Qwen 记忆模型不能直接替代当前限定 OpenRouter 路由的普通主任务验收；本轮未增加替代主模型路由或付费调用。G01/G02/G09 不整体标为完成，G14–G20 及内网上线仍暂缓。
