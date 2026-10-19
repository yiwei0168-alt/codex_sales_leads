# 采集器启动前的 Linux 运行边界

`start-skill-collector.mjs` 现在在读取运行包清单前检查进程与挂载，并在启动 runner 子进程前再检查一次。要求 Linux，真实/有效/保存/文件系统 UID 与非零进程 UID 一致；`NoNewPrivs=1`；五个 capabilities 集合均为空；根、包目录及 Node 可执行文件所在挂载只读，包目录下不存在可写子挂载。缺失、不合法或歧义的 proc 信息拒绝运行。

字段来自当前进程 `/proc/self/status`、`/proc/self/mountinfo`，以每挂载选项而非 superblock 选项判定只读。内核字段定义见 [proc 文档](https://docs.kernel.org/filesystems/proc.html)；`no_new_privs` 在子进程执行间继承，但并不独自排除所有权限变化，见[内核说明](https://docs.kernel.org/userspace-api/no_new_privs.html)。

镜像使用时继续要求 `--read-only --cap-drop=ALL --security-opt=no-new-privileges`，且保持默认非 root 用户。私有配置/任务/密钥应按既有部署边界放在包目录之外；不因本检查而获得提供方或业务授权。检查结果仅作为 `--verify` 的 `runtimeBoundaryVerified` 等局部字段，`productionQualified` 仍为 false。

## 当前证据

20 项原生 Node 测试和 lint 通过。把当前组件只读挂载到既有固定 Linux 镜像中执行六种实际运行环境：合规正例通过；根可写、root 用户、缺少 no-new-privileges、capability bounding set 未清空、包内可写子挂载均被拒绝。没有加载私有任务、密钥或数据库，容器自动删除。[组件证据](evidence/ma24-g09-collector-runtime-boundary-2026-10-19.json)。

镜像验证器已新增“在私有任务处理前拒绝不合格运行配置”的断言，但当前阶段尚未重建包含这些改动的采集器镜像，也未执行新镜像完整入口/声明数据库矩阵；后续必须按固定提交执行两者。

这不是运行包、操作系统和提供方的完整生产认证，也不排除宿主机/其他命名空间修改 backing store、绕开入口、替换共享系统库或签名者自身失陷。源码指纹、包哈希、签名登记、材料来源、真实质量及最终启用事务仍分别核对，自动启用保持关闭。
