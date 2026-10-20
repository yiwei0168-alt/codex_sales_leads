# Docker 空间恢复方案（已确认迁移至 F 盘）

## 执行结果（2026-10-20）

- 用户确认后，完全停止 Docker Desktop 和唯一的 docker-desktop WSL 分发，取得 VHDX 独占读取句柄才开始备份。未重置 Docker 或注销分发。
- 离线备份：`F:\DockerDesktopDataBackup\20261020T003354Z-65d4b2b0\docker_data.vhdx`，43,622,858,752 字节；源流与独立备份读取的 SHA256 均为 `f36042e5b2115f1cb0daff6c7497c73dde4d2d53f2b0fc9db2ee6f39ba5a20fc`。备份与清单保留。原盘此前异常停止，因此这是离线崩溃一致性备份，不是已完成异机恢复演练的业务备份。
- Computer Use 初始化经重试仍失败：`failed to write kernel assets` / os error 3，未执行 UI 操作。已向用户说明改为离线文件迁移：将原 VHDX 移到 `F:\DockerDesktopData\docker_data.vhdx`，独占重读确认同一 SHA256 后，将原 C 盘 `wsl\disk` 目录改为指向该 F 盘目录的 Junction。保留原空目录和备份，沿用目录权限。未修改 Docker 设置；设置页面仍可能显示 C 盘路径，实际文件存储在 F 盘。后续维护须保留此联接及目标，不能当普通空目录清理。
- 迁移状态清单：`F:\DockerDesktopDataBackup\20261020T003354Z-65d4b2b0\migration-state.json`。其中迁移完成时的 `ServiceRecoveryVerified:false` 是启动前历史状态；以下恢复检查是后续证据。
- 官方 CLI 启动 Docker Desktop 后，引擎版本 29.7.2 可读；原 Neo4j、Ollama 自动恢复，原 PostgreSQL 容器手动启动并达到 healthy，未新建业务容器或初始化业务卷。
- 原业务库 `network_copilot_local`：145 张 public 表、9 张 public_evidence 表、4 张 langgraph 表，379 条 knowledge_document 可读；默认 `network_copilot` 无 public 表，不将其作为业务恢复证据。无迁移前逐表清单，以上只证明恢复后的可读性，不证明所有业务行逐项一致。
- 原图谱只读计数为 17 个节点、16 条关系；Ollama 保留 nomic-embed-text:latest 和 qwen3:8b。未调用模型。原有版本镜像仍可列出，包括 7a850163 主运行与采集器，以及 adaaa239 Web/主运行对。
- 完整 ID 核对后清理本轮遗留的一次性容器 `ma24-pilot-fresh-d97645b6d931`（`0bdf1713ac1c17f5db9b577da2be77821be61f94ffe3701311ca2fd39cb82992`）及匿名测试卷，保留三个原有服务。
- 物理迁移后 C 盘可用 48,438,984,704 字节（约45.1 GiB）。恢复服务不等于产品完整验收；此前失败的 Web 构建和完整组合仍须重新运行。继续 G01–G13，G14–G20 和内网上线暂缓。

## 恢复后固定发布核对

恢复后固定提交 `7d1f382cf07d9410fd09fcb202e1e6620857682d` 的 Web、普通主运行、采集器镜像均构建成功。两个独立只读/无网络镜像配对检查通过：972 项源码、Node 24.21.0 及 Node 二进制摘要一致；检查器明确不授予完整依赖运行时等价或生产资格。新 Web 镜像在全新数据库迁移至159后，角色隔离、合成账号/公司及实际 HTTP 工作流通过并清理临时资源。完整签名组合仍在运行，不能由上述结果代替。详见[恢复后验收记录](evidence/ma24-post-docker-migration-recovery-2026-10-20.json)。 [2026-10-20 follow-up: fixed composition exited 0; temporary resources removed. Host archive plus precise fixture migrations only; runtime package registration reports registration-schema-unavailable. No full159 image workflow, real quality, or production qualification claim.]

## 以下为迁移前方案与历史观测

2026-10-20 用户已确认“将数据迁移到F盘后继续”，按 `OPS-DOCKER-01` 执行迁移与恢复验收。此前“待选择/待答复”为历史状态；尚未声明迁移完成。开始执行时 C 盘已恢复约4.3 GiB、F盘约540 GiB，目标 `F:\DockerDesktopData` 尚不存在。

后续已补齐构建前检查：Web、普通主运行包、采集器三种镜像构建，在任何 Docker 调用及临时构建目录创建前检查 Windows 系统盘；0 可用字节抛出 `MA24_SYSTEM_DISK_FULL`，元数据不可读则明确报检查失败。非 Windows 不检查 Windows 卷，正数空间不新增硬性最低门槛；此检查不估计构建所需总量，也不清理或迁移数据。9 项检查器测试及4项错误保留测试（共13项）、类型/lint通过。当前真实C盘0字节的检查结果为 denied，未调用Docker。空间恢复选择仍待用户答复。

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
