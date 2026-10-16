# MA24 首批团队试用 Web 部署模板

本机固定候选镜像：已推送提交 `f54e0b07ccf39c3512f07aac0269af598e915d24`，镜像 `ma24-pilot-web:f54e0b07`，本机摘要 `sha256:7d92278fcc76cd3f2da90abbd87454281d17234b33069f6a3a85c3e6bee7855e`；一次性新库、浏览器、10 人合成并发及试用库备份恢复联合复验通过。[收据](../../docs/evidence/ma24-g01-pinned-pilot-image-full-local-check-2026-10-16.json)。目标主机仍须重新核对其实际拉取/构建的镜像摘要。

本机可用 `node scripts/run-tsx.cjs scripts/verify-ma24-fresh-pilot-new-cluster.ts --web-image=ma24-pilot-web:f54e0b07 --rollback-image=ma24-pilot-web:cc50c7b6` 重验同一回环入口的两版 Web 切换、会话延续、公司记录回读与隔离。[回切收据](../../docs/evidence/ma24-g01-pilot-linux-image-same-port-rollback-2026-10-16.json)。目标主机的可信 HTTPS 路由、实际流量及 worker/数据库/上传卷恢复须独立验收。

本机可用 `node scripts/run-tsx.cjs scripts/verify-ma24-fresh-pilot-new-cluster.ts --web-image=ma24-pilot-web:f54e0b07 --backup --cross-cluster` 复验合成试用库从源 PostgreSQL 集群向第二个全新集群的角色重建和归档恢复。[跨集群收据](../../docs/evidence/ma24-g01-pilot-cross-cluster-restore-2026-10-16.json)。目标主机仍需保存异地备份副本并实际演练恢复；上传持久卷须另行备份。

本模板适用于一台 Linux 主机上的 Web、PostgreSQL 16/pgvector 和原生 Caddy。首批规模按同时使用 10 人以内规划，当前无备案域名且首批只用全新测试数据；真实业务数据将在后续阶段单独迁移。地区、域名和云账号以[托管方案](../../docs/TEAM_PILOT_NEW_HOSTING_2026-10-16.md)中的条件决定。当前没有完成云端部署或团队邀请验收。

本机可用 `node scripts/run-tsx.cjs scripts/verify-ma24-fresh-pilot-new-cluster.ts --web-image=<已构建镜像标签> --browser` 重验镜像、一次性新库、数据库 TLS 与 HTTPS Chrome 基本流程。它会生成并清理临时库、证书、账号和容器；不使用团队真实数据。[当前镜像收据](../../docs/evidence/ma24-g01-current-linux-image-https-browser-2026-10-16.json)。目标主机仍须独立验收真实域名与证书。

同一命令可将 `--browser` 换成 `--ten-user`，对 10 个虚构账号同时发起登录、各自公司写入与隔离读取；[本机收据](../../docs/evidence/ma24-g01-ten-synthetic-users-current-image-2026-10-16.json)。上线前仍需在目标主机观察实际资源与持续使用情况。

## 目标主机准备

1. 确认域名/地区/数据范围与团队持有的云账号；大陆节点须核适用 ICP 备案。DNS 指向主机，公网入站仅按需开放 80/443，数据库只在主机回环地址或受控内网开放。Caddy 自动 HTTPS 需要域名解析和 80/443 可达。[Caddy 官方说明](https://caddyserver.com/docs/automatic-https)。
2. 准备 PostgreSQL 16/pgvector 和专用全新空库。目标环境操作员在独立的临时进程环境中设置受限应用账号的 `DATABASE_URL` 与另一个迁移账号的 `DATABASE_MIGRATION_URL`，运行 `node scripts/run-tsx.cjs scripts/bootstrap-ma24-pilot-db.ts` 创建不可登录的应用/Skill 采集角色和受限应用登录角色；命令拒绝非空应用库或已有同名角色，不覆盖已有密码，也不打印密码。[本机新集群收据](../../docs/evidence/ma24-g01-pilot-role-bootstrap-new-cluster-2026-10-16.json)。然后运行 `npm run db:migrate:pilot-fresh`，它仅在空应用库执行 001–135，重复初始化会拒绝；核对不可登录占位账号外无用户、业务资料为 0，且 136–140 未安装。随后用新试用库备份复验 ACL/RLS 与账号隔离。[本机空库收据](../../docs/evidence/ma24-g01-fresh-pilot-schema-2026-10-16.json)。不要将现有产品库归档复制到试用主机；迁移凭据不放入 Web 环境文件。
   使用受限应用连接执行 `npm run users:upsert` 为每位试用成员分别建号；操作员逐次提供 `APP_USER_EMAIL`、`APP_USER_DISPLAY_NAME`、`APP_PASSWORD_SETUP` 和 `APP_USER_ROLE=member`，按团队凭据流程交付初始密码。建号命令会同时创建个人工作区。密码仅经目标主机的临时进程环境传入，不写入 Git、Compose 文件或验收收据；创建后核对账号数与各自工作区。[本机命令与隔离收据](../../docs/evidence/ma24-g01-fresh-pilot-schema-2026-10-16.json)。
   试用数据写入后，在停止新写入的维护窗口，由操作员安装 PostgreSQL 16 的 `pg_dump`/`pg_restore`，设置绝对路径 `PILOT_BACKUP_DIR`（位于 Git 工作树外，Linux 权限仅限操作员），运行 `node scripts/run-tsx.cjs scripts/backup-verify-ma24-pilot-db.ts`。命令保存自定义归档及 SHA-256 清单，恢复到同集群第二个一次性数据库，比对账号/工作区/资料计数及两名成员的可见公司，并以受限角色读回；恢复库随后删除，归档保留在备份目录。[本机合成收据](../../docs/evidence/ma24-g01-pilot-backup-restore-command-2026-10-16.json)。另行保存受控的异地主机副本，并在目标环境复验；本机同集群结果不等于跨集群或线上恢复通过。
3. 固定并推送试用提交，在目标 Linux 主机运行 `node scripts/build-ma24-pilot-image.mjs`。记录完整提交 ID、镜像标签和镜像摘要。构建命令只打包已提交的 Git 快照。
4. 在 Git 工作树外建立权限受限的 Web 环境文件，例如 `/etc/ma24/pilot-web.env`，只放运行所需的 `DATABASE_URL`。它应指向受限应用账号；如果数据库不在同机回环地址，按应用的生产连接要求提供可验证 TLS。不要放 `DATABASE_MIGRATION_URL`、`PAID_CALL_STAGE_OVERRIDE` 或 `PAID_CALL_STAGE_OVERRIDE_USER_ID`。
5. 在 Git 工作树外建立 Compose 变量文件，例如 `/etc/ma24/pilot-host.env`，填写 `PILOT_WEB_IMAGE`、`PILOT_WEB_ENV_FILE` 的绝对路径、`PILOT_WEB_PORT=3000` 和 `PILOT_DOMAIN`。这些变量不应包含数据库密码；账号凭据只在 Web 环境文件中。运行 Compose 的操作员与读取同一变量文件的 Caddy 服务账户须有相应读取权限。

Web 使用 Linux 的 host 网络模式，只监听 `127.0.0.1`；Docker 不为它发布公网端口。上传原件挂载在 `ma24-pilot_pilot_uploads` 持久卷，必须纳入备份。后台 worker 若启用，需要另行共享同一上传存储并完成自身的运行与权限验收。Docker 官方说明 host 网络模式适用于 Linux 主机，且端口映射在该模式下不生效。[Docker host 网络文档](https://docs.docker.com/engine/network/drivers/host/)。

## 启动与检查

数据库和上传卷备份命令均按脚本所在仓库核对备份目录，并解析实际文件系统路径；即使从其他目录启动，也拒绝工作树内部、`..backup` 这类目录名和从外部指回工作树的目录联接。可运行 `node scripts/verify-ma24-pilot-backup-paths.mjs` 核对边界；Windows 回归需要允许创建临时目录联接。[路径回归](../../docs/evidence/ma24-g01-pilot-backup-path-boundary-2026-10-16.json)。

上传卷备份：在同一维护窗口停止 Web 及所有资料 worker 后，设置 `PILOT_UPLOAD_VOLUME=ma24-pilot_pilot_uploads` 和工作树外的绝对目录 `PILOT_BACKUP_DIR`，运行 `node scripts/backup-verify-ma24-pilot-uploads.mjs`。命令核对卷已存在且没有运行容器挂载，以只读源卷生成私有 tar 归档和 SHA-256 清单；恢复到一次性卷后逐文件比较内容、属主及权限，并核对 uid 1000 可读，最后只删除恢复卷。源卷保留；归档与清单保留在备份目录。数据库备份应在恢复写入前完成，两个备份须作为同一维护窗口的一组保留并另存异地副本。[合成卷验收](../../docs/evidence/ma24-g01-pilot-upload-volume-backup-2026-10-16.json)。本机可运行 `node scripts/verify-ma24-pilot-upload-backup.mjs` 重验合成卷；目标主机上的真实上传原件回读和异地恢复仍须独立验收。

在固定提交的工作树运行：

```sh
docker compose --env-file /etc/ma24/pilot-host.env -f deploy/pilot/compose.web.yaml config --quiet
docker compose --env-file /etc/ma24/pilot-host.env -f deploy/pilot/compose.web.yaml up -d
docker compose --env-file /etc/ma24/pilot-host.env -f deploy/pilot/compose.web.yaml ps
```

`config --quiet` 用来校验配置，避免把解析后的 `DATABASE_URL` 打印到终端日志。Compose 插值变量与容器 `env_file` 是两层不同配置。[Docker Compose 环境变量文档](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)。容器健康检查只证明匿名会话 HTTP 路由可用，不证明数据库、资料 worker 或业务质量。

将 [Caddyfile](Caddyfile) 安装到目标主机的 Caddy 配置位置，并给 Caddy 服务提供 `PILOT_DOMAIN` 和 `PILOT_WEB_PORT` 环境变量。可以在 systemd 的 Caddy 服务覆写中使用 `EnvironmentFile=/etc/ma24/pilot-host.env`，然后重新加载服务管理器、验证 Caddy 配置并启动服务。Caddyfile 将域名 HTTPS 反向代理到本机 Web 端口；`{$PILOT_DOMAIN}` 是 Caddy 解析时环境变量，不是 Compose 变量。[Caddy 环境变量文档](https://caddyserver.com/docs/caddyfile/concepts#environment-variables)。目标域名证书、DNS、外部访问和浏览器安全 Cookie 均须实际核验。

开放试用前在目标 HTTPS 域名以团队测试账号及虚构业务数据逐项核对登录、退出、两账号隔离、手动线索写入/回读、错误路径、新试用库备份恢复、并发资源观察及停止写入后的实际回切。记录镜像与数据库版本、回切触发条件和结果后再发邀请。当前 G02–G13 与 G14–G16 未完成的功能和质量门槛仍按各自验收条件处理；Web 可启动不代表这些功能已上线。生产环境不要使用 `docker compose down --volumes`，它会删除上传持久卷。
