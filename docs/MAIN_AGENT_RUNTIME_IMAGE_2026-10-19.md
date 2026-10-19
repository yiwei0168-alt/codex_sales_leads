# G01/G02 普通主任务运行包

新增独立主任务镜像构建入口：`node scripts/build-main-agent-runtime-image.mjs`。构建只读取当前 Git 提交的 archive，固定 Node 24 基础镜像摘要和 npm 锁文件；worker 与 `mainAgentWorkflowGraph` 分别编译为 ESM，保留输入清单及 SHA-256。普通 worker 在 --once 或停止循环结束后关闭数据库池。

镜像包含 server/worker 两个角色。server 使用现有 LangGraph API，监听本容器 `127.0.0.1:2024`；worker 可在同一网络命名空间连接此地址。外层 API 的本地状态文件写 `/runtime`，应用内层 checkpoint 和权威任务收据仍在 PostgreSQL。`/runtime` 的目标环境持久化与备份尚未验收。

入口要求非 root、只读根文件系统、清空 capabilities 和 no-new-privileges；检查实际 Node/全部包文件与构建清单。`--verify` 可离线检查，运行角色要求 production 模式及应用连接，拒绝迁移连接和 Node 注入参数。这些是本地包/进程检查，不构成生产来源认证、提供方资格或 Skill 启用。

本阶段本地 ESM 构建、类型与定向 lint 已通过；固定 Linux 镜像、真实 API/worker 领取和恢复链待验。没有部署、模型调用或成员邀请。G14–G20 与内网上线仍暂缓。

2026-10-20：固定 `9d5d50f3` Web/主运行包构建与 963 项源码/Node 指纹核对通过，实际 API 启动暴露 `server-only` 标记被 ESM 打包提升到顶层的问题。无网络/无数据库凭据的同镜像导入精确复现 `ERR_MODULE_NOT_FOUND`。Node 专用构建现映射到已安装 Next 的服务端 empty 模块，保留 Web 构建中的原守卫；启动错误仅报告阶段与受限错误码，正常退出关闭连接池。修复后的固定镜像及实际 API/worker 仍待重验，初次失败日志保留在 `tmp/ma24-main-runtime-worker-9d5d50f3-2026-10-20.log`。
