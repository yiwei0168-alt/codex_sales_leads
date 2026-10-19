# Docker 空间恢复方案（待选择）

## 本机已核实

- C: 可用 **0 字节**，总计 214,749,409,280 字节；F: 可用 579,849,920,512 字节（约 540 GiB）。
- Docker 数据文件：`C:\Users\张益玮\AppData\Local\Docker\wsl\disk\docker_data.vhdx`，43,622,858,752 字节（约 40.63 GiB）。另有 main/ext4.vhdx 约 0.09 GiB。
- 日志记录 containerd bus error，WSL 数据盘卸载失败。C 盘已满是当前必须处理的环境条件，不据此断言是所有异常的唯一原因。
- 常规启动返回“已运行”但状态为 stopped；随后通过官方 CLI 发起常规后台重启，最后一次观察为新会话 starting，尚未证明引擎恢复。
- Web `7a850163` 构建已退出 1，错误为引擎连接 EOF，不能记为通过；主运行和采集器的构建已分别退出 0。

## 方案 A：先释放 C 盘空间

由用户选择可移动/删除的个人文件，释放至少 10 GiB（本次工作余量建议，不是 Docker 产品的硬性最低值），然后复查 `docker info`。不删除项目数据库、Codex 历史或凭据。此方案改动最少，可先恢复后续验收；Docker 数据仍在 C 盘，需持续保留空间。

## 方案 B：保留 Docker 数据，迁移到 F 盘

建议目标：`F:\DockerDesktopData`。该目标尚未创建或写入，迁移尚未执行。

1. 先处理少量 C 盘余量，使 Desktop 能稳定启动/退出；停止新构建。
2. 完全退出 Docker Desktop，确认数据盘不再由 WSL 挂载；离线备份上述约 40.63 GiB 的数据文件到 F 盘，验证大小与 SHA-256。备份在恢复成功前保留，不以复制成功替代数据库恢复验证。
3. 使用 Docker Desktop **Settings → Resources → Advanced → Disk image location** 的内置迁移入口选择目标，保留镜像、卷和容器；不直接移动正在使用的 VHDX，不注销 WSL 分发或重置 Docker。
4. 启动后核对镜像 ID、三个原有服务及数据库/资料可读性；仅核对并清理已确认的一次性验收容器。
5. 完成验证后再决定原位置和备份的保留/清理，当前方案不授权自动删除原始数据或备份。

这会改变 Docker 全部本地数据的存储位置，并影响既有数据库/图谱/模型容器，因此在用户选择前不执行迁移。F 盘当前容量可容纳备份及迁移副本，但实际迁移仍需以离线检查和 Desktop 结果为准。

官方依据：[Docker WSL 2 后端及数据位置](https://docs.docker.com/desktop/features/wsl/)、[备份与恢复 Docker Desktop 数据](https://docs.docker.com/desktop/settings-and-maintenance/backup-and-restore/)。

## 选择后继续的项目工作

清理核对后的本轮测试资源，重新构建 Web，核对同版三包，再重跑固定完整签名组合。完整组合之前失败，不重用为通过证据；真实质量与生产启用仍未完成。G14–G20、内网上线继续暂缓。
