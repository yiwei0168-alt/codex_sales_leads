# G09 独立采集进程

## 当前实现

`node scripts/build-skill-collector.mjs` 将仓库采集入口及内部模块编译为 `tmp/skill-collector/runner.cjs`，同时写入 SHA-256 和输入文件列表。输出目录被 Git 忽略；构建没有复制环境文件、密钥或业务数据。依赖包仍从安装环境加载，当前摘要只覆盖生成的入口包，不能认证全部依赖、Node 或运行主机。

普通 Node 启动方式：

```text
node tmp/skill-collector/runner.cjs --help
node tmp/skill-collector/runner.cjs --check <private-job.json>
node tmp/skill-collector/runner.cjs --execute <private-job.json>
```

`--check` 仅核对数据库连接角色和服务器冻结计划，不调用模型、不验证全部来源或提供方；`--execute` 才执行配置入口。当前仅在一次性新库执行过 `--check`，没有执行真实模型任务。不要用带有 preload 的 `run-tsx.cjs` 启动生成包。

任务文件严格限定 `ownerId`、`freezeId`、`evaluationId`、`caseId`、1–64 的 `maximumModelCalls` 和类型选择：`safety` 需要 `runId`、`arm`，`historical` 需要 `runId`，`prospective` 需要 `jobId`。Skill ID、版本和计划从账号隔离的服务器冻结记录派生，不接受任务文件提供的计划、回复或模型回调。任务文件是受限操作员输入，不能作为 HTTP/Agent 请求入口。

进程要求 `NODE_ENV=production`、无 Node 注入参数及 `NODE_OPTIONS`，关闭外部 tracing。实际执行建立账号绑定的计费上下文，仍需正常余额/预算准入及另行明确的真实付费调用授权。输出只含状态、评测 ID 和核对摘要，不打印响应正文、私有来源或凭据；失败输出统一错误提示，须核对服务器持久记录后决定恢复，不能假定未发生调用。

## 数据库权限

应用连接仍用 `DATABASE_URL`；单独的 `SKILL_COLLECTOR_DATABASE_URL` 必须指向相同数据库、不同登录。该登录须为 `LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`，有 `network_copilot_skill_collector` 成员资格，无 `network_copilot_app` 成员资格。代码不创建生产登录或授予生产权限。

每个采集事务检查登录属性，切换到受限采集角色、复核角色属性并设置账号 RLS 上下文；不重放失败事务。远程连接要求 `sslmode=verify-full` 和实际 TLS，沿用 `DATABASE_SSL_CA` / `DATABASE_SSL_CA_FILE`。生产凭据和私钥通过受限环境/文件配置，不进入 Git。

## 已验与未验

实际镜像 `ma24-skill-collector:492e5647` 已从固定提交构建并验收，镜像 ID 为 `sha256:f19775de2884e75f868e2b73a1a705a81a37bdf1bd7009102d682212212b663c`。907 个源码输入与提交一致；运行清单含 34,422 个文件/链接并绑定 Node 可执行文件。非 root、只读、无网络条件下清单校验与帮助入口通过，挂载篡改的 runner 后在执行前拒绝。临时容器和篡改夹具已清理，[证据](evidence/ma24-g09-collector-image-2026-10-16.json)。这取代下一段“待实际镜像构建”的阶段状态，但不改变生产认证仍未通过的结论。

新增 `Dockerfile.skill-collector` 和 `scripts/build-skill-collector-image.mjs`：只从已提交 Git archive 构建，固定 Node 基础镜像摘要，以 `npm ci` 安装锁定依赖；运行包包含采集器、内部源码指纹材料和实际安装依赖。生成清单绑定包内全部普通文件、内部符号链接及 Node 可执行文件摘要，启动时核对后再运行。运行用户为非 root。清单校验器仍位于同一镜像中，需由部署方固定可信镜像摘要；自校验本身不能替代外部生产认证。新增清单内容变化/额外依赖文件测试已通过；此提交阶段尚待实际镜像构建及隔离启动验收。

基于 `13ca63d2` 的新实现已通过类型检查、定向 lint、构建及普通 Node `--help`。一次性 PostgreSQL 新库中创建专用临时登录，受限角色追加/签名回读通过；增加应用角色成员资格后被拒绝，撤销后恢复；独立编译进程 `--check` 通过。测试容器和临时任务/公钥文件清理完成。构建包含 297 个内部输入，已验入口摘要 `3b91549133b3b81b5989dd6793a2621a3b95140495a924e62a675d56fe6e9488`；这只是本轮构建证据。

尚缺完整依赖与部署包认证、生产登录与密钥登记、真实提供方执行及质量审核、旧基线的可信传输来源、失败/回退收据和最终锁定启用事务。`productionQualified`、`binaryVerified` 和 `automaticActivation` 不因本轮通过而变为 true。G09 未关闭。
