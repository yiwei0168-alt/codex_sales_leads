# G09 独立采集进程

2026-10-19 固定 `d6ffb7a1` 双镜像已通过确切 commit/revision、不可变镜像 ID、956 源码输入及 Node 二进制核对；新采集器 34,471 文件清单、登记/篡改/运行边界矩阵及 Web 全新 156/TLS/HTTPS/十账号/快照通过。独立 TLS 声明矩阵仍运行；完整依赖执行、生产及启用不获批准。[最新固定包边界](REPRODUCIBLE_RUNTIME_PAIR_2026-10-19.md)。

2026-10-19 构建可复现性修复：Web 与采集器统一既有固定 Node 基础摘要，两构建器按先前解析的确切 commit 归档，Web 补 revision label，运行包检查按不可变镜像 ID 执行并要求 revision 一致。当前为语法/差异检查阶段，实际同提交双镜像检查待执行；不认证完整依赖、提供方或启用。[修复范围](REPRODUCIBLE_RUNTIME_PAIR_2026-10-19.md)。

## 当前实现

配套 Web 候选现为 `ma24-pilot-web:57832601`，与采集器的 909 个源码输入及 Node 二进制一致，共享源码/Node 指纹 `a2242f921e69b7bf839ec4fd1cba98aca4d926d62334b70c8a68dcddd20b8afd`。[基线证据](evidence/ma24-g01-g09-web-collector-baseline-2026-10-16.json)同时验证十个合成账号隔离、原会话和数据库断线恢复。Web 内被打包的依赖不能从顶层直接解析，完整编译运行依赖等价性仍未证实；源码身份一致不意味着生产 Agent 等价认证通过。

当前已验采集发布包为 `ma24-skill-collector:6fc08071`，镜像 ID `sha256:b7c8214619c4e4ec12ec6e8ad27a6c19696f8fdc523cb21e74faf4b19690585a`，已包含失败/回退签名。909 个源码输入与提交一致，34,424 个包内文件/链接核对、非 root/只读/无网络启动、篡改拒绝及可信 CA 数据库 `--check` 均通过，[本轮证据](evidence/ma24-g09-fallback-collector-image-2026-10-16.json)。旧 `492e5647` 保留为历史，不再是当前候选。尚未执行真实提供方任务或生产部署。

2026-10-19 从 Git 提交 `42f71deddc76c273d7e170de881496fa3df75401` 固定归档重建了镜像 `ma24-skill-collector:42f71ded`，并在新 PostgreSQL 集群完成受限 collector 登录及 TLS `verify-full` `--check`。[证据](evidence/ma24-g09-current-collector-image-tls-preflight-2026-10-19.json)。它更新的是当前源码验收镜像；生产资格仍为 false，未执行 `--execute`、模型或真实提供方请求，不能据此认证部署二进制或启用 Skill。

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

本轮源代码已新增[失败与回退签名](evidence/ma24-g09-signed-fallback-journal-2026-10-16.json)，93 项回归和一次性库完整链通过。下述 `492e5647` 镜像属于此前发布点，不含本次修改，部署前必须从新固定提交重建并核对。此前“失败/回退收据未实现”的记录保留为历史；真实提供方、终止/未知失败处理验收和最终启用仍未完成。

后续[镜像到数据库的 TLS 预检](evidence/ma24-g09-collector-image-tls-preflight-2026-10-16.json)已通过：固定采集器镜像以非 root、只读、无 capabilities 方式运行 `--check`，使用挂载的公开 CA、`sslmode=verify-full`、独立应用与采集登录连接临时数据库并读取冻结记录。镜像共享数据库容器网络命名空间，经 localhost 连接；未覆盖真实云网络，也未执行 `--execute`。持久签名的合成夹具仍由宿主脚本写入，不能将其归为镜像中的提供方执行。

实际镜像 `ma24-skill-collector:492e5647` 已从固定提交构建并验收，镜像 ID 为 `sha256:f19775de2884e75f868e2b73a1a705a81a37bdf1bd7009102d682212212b663c`。907 个源码输入与提交一致；运行清单含 34,422 个文件/链接并绑定 Node 可执行文件。非 root、只读、无网络条件下清单校验与帮助入口通过，挂载篡改的 runner 后在执行前拒绝。临时容器和篡改夹具已清理，[证据](evidence/ma24-g09-collector-image-2026-10-16.json)。这取代下一段“待实际镜像构建”的阶段状态，但不改变生产认证仍未通过的结论。

新增 `Dockerfile.skill-collector` 和 `scripts/build-skill-collector-image.mjs`：只从已提交 Git archive 构建，固定 Node 基础镜像摘要，以 `npm ci` 安装锁定依赖；运行包包含采集器、内部源码指纹材料和实际安装依赖。生成清单绑定包内全部普通文件、内部符号链接及 Node 可执行文件摘要，启动时核对后再运行。运行用户为非 root。清单校验器仍位于同一镜像中，需由部署方固定可信镜像摘要；自校验本身不能替代外部生产认证。新增清单内容变化/额外依赖文件测试已通过；此提交阶段尚待实际镜像构建及隔离启动验收。

基于 `13ca63d2` 的新实现已通过类型检查、定向 lint、构建及普通 Node `--help`。一次性 PostgreSQL 新库中创建专用临时登录，受限角色追加/签名回读通过；增加应用角色成员资格后被拒绝，撤销后恢复；独立编译进程 `--check` 通过。测试容器和临时任务/公钥文件清理完成。构建包含 297 个内部输入，已验入口摘要 `3b91549133b3b81b5989dd6793a2621a3b95140495a924e62a675d56fe6e9488`；这只是本轮构建证据。

尚缺完整依赖与部署包认证、生产登录与密钥登记、真实提供方执行及质量审核、旧基线的可信传输来源、失败/回退收据和最终锁定启用事务。`productionQualified`、`binaryVerified` 和 `automaticActivation` 不因本轮通过而变为 true。G09 未关闭。
