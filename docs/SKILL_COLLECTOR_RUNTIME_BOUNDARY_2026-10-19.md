# 采集器启动前的 Linux 运行边界

`start-skill-collector.mjs` 现在在读取运行包清单前检查进程与挂载，并在启动 runner 子进程前再检查一次。要求 Linux，真实/有效/保存/文件系统 UID 与非零进程 UID 一致；`NoNewPrivs=1`；五个 capabilities 集合均为空；根、包目录及 Node 可执行文件所在挂载只读，包目录下不存在可写子挂载。缺失、不合法或歧义的 proc 信息拒绝运行。

字段来自当前进程 `/proc/self/status`、`/proc/self/mountinfo`，以每挂载选项而非 superblock 选项判定只读。内核字段定义见 [proc 文档](https://docs.kernel.org/filesystems/proc.html)；`no_new_privs` 在子进程执行间继承，但并不独自排除所有权限变化，见[内核说明](https://docs.kernel.org/userspace-api/no_new_privs.html)。

镜像使用时继续要求 `--read-only --cap-drop=ALL --security-opt=no-new-privileges`，且保持默认非 root 用户。私有配置/任务/密钥应按既有部署边界放在包目录之外；不因本检查而获得提供方或业务授权。检查结果仅作为 `--verify` 的 `runtimeBoundaryVerified` 等局部字段，`productionQualified` 仍为 false。

## 当前证据

后续固定 `3f5c1556` 镜像已构建并通过完整入口验收，34,470 个包文件的 deployment hash 为 `5641715f056b39cf4b4a983389e23e37252de4ce898cb2bdd111dc6c54ff806b`。正常核对/帮助及匹配登记进入 runner；根可写、root 用户、增加 CHOWN capability、包内可写子挂载均在私有任务处理前拒绝，篡改/错误登记/Node 参数注入仍被拒绝。[新镜像收据](evidence/ma24-g09-collector-runtime-image-2026-10-19.json)。同镜像实际 TLS 数据库签发、回读、重试及账号/来源/密钥/用途/撤销/Node 参数/TLS 根/部署包不匹配拒绝矩阵也已退出 0，临时资源清理。[签发矩阵收据](evidence/ma24-g09-collector-runtime-declaration-2026-10-19.json)。

20 项原生 Node 测试和 lint 通过。把当前组件只读挂载到既有固定 Linux 镜像中执行六种实际运行环境：合规正例通过；根可写、root 用户、缺少 no-new-privileges、capability bounding set 未清空、包内可写子挂载均被拒绝。没有加载私有任务、密钥或数据库，容器自动删除。[组件证据](evidence/ma24-g09-collector-runtime-boundary-2026-10-19.json)。

组件阶段未重建镜像的历史限制由上面的固定镜像入口和签发收据补齐。完整五类运行在新 Linux 镜像内的证据、生产认证及最终启用仍未完成。

这不是运行包、操作系统和提供方的完整生产认证，也不排除宿主机/其他命名空间修改 backing store、绕开入口、替换共享系统库或签名者自身失陷。源码指纹、包哈希、签名登记、材料来源、真实质量及最终启用事务仍分别核对，自动启用保持关闭。
