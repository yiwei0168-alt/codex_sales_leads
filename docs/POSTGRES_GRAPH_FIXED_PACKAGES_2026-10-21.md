# 候选图 PostgresSaver 接线后的固定包

既有 MA24-06，无新增用户确认；继续 G01–G13，G14–G20 及部署暂缓。

## 构建与检查通过

产品源码固定为 `359cbc6000c027fe48fc7ec2ddd1d5ef672492fa`，包含候选元数据通道、同步持久化、初始预算恢复与只读审计禁用继承修复。三包均从同一 Git 提交归档构建并退出 0：

| 包 | 不可变镜像 ID |
|---|---|
| 主流程 | `sha256:02421197a7992d87352f1f76546bdba5b5fe982f842ae954151494ed970c17c1` |
| 采集器 | `sha256:ad2c4fe22fb27db43006486e120f8f4e281cbe8f1762fc6917f6d6a043e25238` |
| Web | `sha256:08280f831864c0babb892f0b126655b144f02cc3a2fbc1bdfb3f9a230b6103e9` |

主流程/采集器的 1022 源码输入、Node 24.21.0/二进制、33503 依赖及 ESM 对齐通过；两包分别 34574/34538 文件。采集器实际只读、非 root、无网络、登记和篡改/NODE_OPTIONS 拒绝通过。Web 固定源码、静态文件和私有文件排除通过，BUILD_ID 为 `WNpiOXznTZz2TWjOpT5En`；1022 项导出差异仅为行尾。

## 分项终态与完整组合待验

当前终态：**58232 已退出 0**，实际固定采集器声明在新 170/TLS 库通过数据库信任签发/回读/重试、登记禁用等待提交、根证书/部署/账号/用途/撤销/NODE_OPTIONS 拒绝，并清理独立资源。[数据库信任收据](evidence/ma24-g09-postgres-graph-declaration-db-trust-2026-10-21.json)。

**96880 已退出 1**：共享租约组件先通过，正式候选组件夹具仍解引用旧 `saved.payload.state`，而新图入口的私有 payload 保持 null，导致 TypeError。没有通过整轮组合，资源已清理。[失败收据](evidence/ma24-g09-postgres-graph-linux-fixture-failure-2026-10-21.json)。

仅夹具修正：统一按账号/评估/臂/来源哈希绑定线程，用已安装 PostgresSaver 重建根图；要求旧 payload 为 null，按声明通道严格解析状态，保留 completed/Skill 使用断言，并补五次调用和四条轨迹断言。正式进程终止夹具复用同一读者。完整类型及三文件 lint 通过，产品镜像不变；夹具已提交，新组合会话 9428 仍待终态，不据静态检查标通过。[修正范围](evidence/ma24-g09-postgres-graph-readback-fixture-2026-10-21.json)。

终态更新：**86473 已退出 0**，当前固定 API/Worker 的合成终态/来源、完成及未知 Skill 回执、空图标准模式模型回执恢复通过，独立资源已清理。实际图只复用预存模型回执，首次提供方执行、原始进程崩溃及真实质量未验。[Worker 收据](evidence/ma24-g09-postgres-graph-sdk-worker-2026-10-21.json)。

**17467 已退出 0**，实际采集器 TLS/登记匹配和密钥用途/撤销等拒绝通过，但该轮为本地信任文件模式，`configuredDeclarationDatabaseTrustVerified=false`，不覆盖数据库登记/禁用串行。保留该窄范围收据；专用 `MA24_DECLARATION_DATABASE_TRUST=1` 的 **58232** 已通过，结果单独记录。[文件模式收据](evidence/ma24-g09-postgres-graph-declaration-file-trust-2026-10-21.json)。

- **17467**：当前采集器镜像的独立正式声明 TLS，新 170 库。
- **86473**：当前主流程镜像的实际 API/Worker，新 170/TLS 库，合成终态与来源、完成/未知 Skill 回执、空图模型回执恢复。
- **96880**：当前主流程/采集器及同提交夹具的新 170 Linux 五类/测量登记组合；要求提交后真实进程终止、原租约自然到期、恢复不重放已完成 HTTP 步骤。

以上启动描述为历史记录：17467、86473、58232 已退出 0，96880 已退出 1，分别以上方终态为准。

## 修正夹具后的完整组合：9428 仍运行

产品镜像保持 `359cbc60`，修正后的测试夹具已提交并归档固定为 `5a7b027c2624d3240224134631c126c8ede050dc`。新轮日志为 `tmp/ma24-postgres-graph-readback-fixed-linux.log`。通过原会话句柄继续观察，没有因缓冲日志为空而重启。

最新直接数据库观察：10 个隐藏评估任务 completed、4 个控制夹具 cancelled；10 个图线程仅有 1 个命名空间。此前旧 payload 读取失败点已越过。观察时原命令仍运行，尚无最终退出结果；这些中间状态不能证明整轮通过或自然到期恢复通过。

待核对最终输出中的五类同冻结组合、测量登记、真实进程终止、原租约自然到期、恢复不重放已完成 HTTP 步骤，以及隔离资源清理。完整组合的包装器/TLS、首次提供方执行、完整生命周期、真实身份与独立质量仍保留门槛。没有真实模型调用、业务操作、部署或启用。

[构建与测量收据](evidence/ma24-g01-g09-postgres-graph-fixed-packages-2026-10-21.json)；[接线与已通过的本机历史实库范围](CANDIDATE_GRAPH_POSTGRES_ENTRY_2026-10-21.md)。旧 a3dba04c 固定包 61937 已通过，独立保留，不能扩称本版本组合通过。
