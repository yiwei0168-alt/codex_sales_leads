# G01/G02 普通主任务运行包

新增独立主任务镜像构建入口：`node scripts/build-main-agent-runtime-image.mjs`。构建只读取当前 Git 提交的 archive，固定 Node 24 基础镜像摘要和 npm 锁文件；worker 与 `mainAgentWorkflowGraph` 分别编译为 ESM，保留输入清单及 SHA-256。普通 worker 在 --once 或停止循环结束后关闭数据库池。

镜像包含 server/worker 两个角色。server 使用现有 LangGraph API，监听本容器 `127.0.0.1:2024`；worker 可在同一网络命名空间连接此地址。外层 API 的本地状态文件写 `/runtime`，应用内层 checkpoint 和权威任务收据仍在 PostgreSQL。`/runtime` 的目标环境持久化与备份尚未验收。

入口要求非 root、只读根文件系统、清空 capabilities 和 no-new-privileges；检查实际 Node/全部包文件与构建清单。`--verify` 可离线检查，运行角色要求 production 模式及应用连接，拒绝迁移连接和 Node 注入参数。这些是本地包/进程检查，不构成生产来源认证、提供方资格或 Skill 启用。

本阶段本地 ESM 构建、类型与定向 lint 已通过；固定 Linux 镜像、真实 API/worker 领取和恢复链待验。没有部署、模型调用或成员邀请。G14–G20 与内网上线仍暂缓。
