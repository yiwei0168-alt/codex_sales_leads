# G01/G02 固定主任务 API/worker 运行验收

## 固定运行包

两镜像均来自 `66924a4835d172028199c99403f55a04f0490b58` 的 Git archive：

| 角色 | 镜像 ID |
| --- | --- |
| Web `ma24-pilot-web:66924a48` | `sha256:f120c751c95c1f8ebe8ef08c392cd7b6f00dab929582054bb0328f972b073b11` |
| 普通主任务 `ma24-main-agent-runtime:66924a48` | `sha256:48c391461a08e29aec9ea2a937172c5d447d57216f9d5bf85e1b20edbab1cc86` |

963 项源码/配置输入、Linux x64 Node 24.21.0 及 Node 二进制 SHA-256 一致。共同源码运行指纹为 `156a2ed1159d55a973a36cfaa748b7925bb73fce4b02139600948ce7100fab4a`。普通运行包的 34,513 个包文件及 Node 检查通过，非 root、只读根/包/Node、空 capabilities、no-new-privileges 均核对；注入 NODE_OPTIONS 拒绝。

`pg` 等可顶层解析依赖符合锁文件；Web 有五项依赖由 Next 内部打包，不将顶层不可解析视为缺包，也不宣布完整依赖运行等价。普通运行包不是 Skill 采集器，不替代此前 `dddb9bfc` 的采集器声明与双镜像证据。

## 实际链路

全新迁移 158 PostgreSQL，API 和 worker 用受限应用连接及 verify-full TLS，运行容器未接收迁移账号。实际 LangGraph API 监听本容器回环地址，worker 在相同网络命名空间通过 SDK 请求；没有向局域网发布端口。

宿主以合成模型回调预存实际 PostgreSQL 内层完成态 checkpoint；之后由镜像中的真实编译 worker 执行 --once，实际领取队列租约，经真实 API 调用编译的 `mainAgentWorkflowGraph`/`executeMainAgentRun`，恢复 checkpoint 并进入最新受保护结算：

- 正向：来源仍共享，任务完成，正确助手消息与一条提取任务落库。
- 拒绝：来源在 checkpoint 形成后撤回共享，任务为 partial，仅保存安全提示，提取任务为零。
- 两例的 `main_model` 尝试行均为零，无真实模型调用或外部动作；worker 退出码为 0，实际任务租约由 worker 领取。

另用同一 Web 镜像完成全新库的既有登录/账号隔离 HTTP 检查。没有重做 HTTPS 浏览器、十成员、备份/回滚或所有工作流。临时 API、worker、Web、数据库容器及网络均清理。

## 失败保留与修复

初始 `9d5d50f3` 的源码/Node 核对通过，但 API 加载编译图失败。同镜像无网络、无数据库凭据的直接导入精确复现 `ERR_MODULE_NOT_FOUND: server-only`：Node ESM 打包把原本延迟加载模块中的 Next 标记提升到顶层。

Node 专用构建映射到已安装 Next 的服务端 empty 模块；Web 原有标记守卫不变。修复后的宿主与 Linux 模块导入、同提交镜像构建和上述完整恢复链通过。启动失败仅输出阶段和受限错误码。初次日志与修复后日志分别保存，未以重试掩盖失败。

## 剩余门槛

这证明编译队列 worker/API 的 checkpoint 恢复和最终结算接线，不是首次实际模型调用到完成的真实业务链、真实模型/提供方认证、进程崩溃与未知提交恢复或独立质量验收。外层 API 的 `/runtime` 状态在本轮使用临时文件系统，目标环境持久卷/备份、持续运行、负载及完整三包发布与回滚尚待验；内层 checkpoint 由 PostgreSQL 保存。G09 完整来源保护、生产来源资格与最终启用仍未完成；G14–G20 和内网上线暂缓。

[结构化证据](evidence/ma24-g01-g02-main-runtime-worker-2026-10-20.json)。
