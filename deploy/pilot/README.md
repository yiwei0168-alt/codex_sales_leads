# MA24 首批团队试用 Web 部署模板

本模板适用于一台 Linux 主机上的 Web、PostgreSQL 16/pgvector 和原生 Caddy。首批规模按同时使用 10 人以内规划；实际资源、地区、域名和真实数据范围以[托管方案](../../docs/TEAM_PILOT_NEW_HOSTING_2026-10-16.md)中的条件决定。当前没有完成云端部署或团队邀请验收。

## 目标主机准备

1. 确认域名/地区/数据范围与团队持有的云账号；大陆节点须核适用 ICP 备案。DNS 指向主机，公网入站仅按需开放 80/443，数据库只在主机回环地址或受控内网开放。Caddy 自动 HTTPS 需要域名解析和 80/443 可达。[Caddy 官方说明](https://caddyserver.com/docs/automatic-https)。
2. 准备 PostgreSQL 16/pgvector、受限应用登录角色、持久存储和新备份；在目标环境复验归档恢复、ACL/RLS 与账号隔离。迁移凭据不放入 Web 环境文件。
3. 固定并推送试用提交，在目标 Linux 主机运行 `node scripts/build-ma24-pilot-image.mjs`。记录完整提交 ID、镜像标签和镜像摘要。构建命令只打包已提交的 Git 快照。
4. 在 Git 工作树外建立权限受限的 Web 环境文件，例如 `/etc/ma24/pilot-web.env`，只放运行所需的 `DATABASE_URL`。它应指向受限应用账号；如果数据库不在同机回环地址，按应用的生产连接要求提供可验证 TLS。不要放 `DATABASE_MIGRATION_URL`、`PAID_CALL_STAGE_OVERRIDE` 或 `PAID_CALL_STAGE_OVERRIDE_USER_ID`。
5. 在 Git 工作树外建立 Compose 变量文件，例如 `/etc/ma24/pilot-host.env`，填写 `PILOT_WEB_IMAGE`、`PILOT_WEB_ENV_FILE` 的绝对路径、`PILOT_WEB_PORT=3000` 和 `PILOT_DOMAIN`。这些变量不应包含数据库密码；账号凭据只在 Web 环境文件中。运行 Compose 的操作员与读取同一变量文件的 Caddy 服务账户须有相应读取权限。

Web 使用 Linux 的 host 网络模式，只监听 `127.0.0.1`；Docker 不为它发布公网端口。上传原件挂载在 `ma24-pilot_pilot_uploads` 持久卷，必须纳入备份。后台 worker 若启用，需要另行共享同一上传存储并完成自身的运行与权限验收。Docker 官方说明 host 网络模式适用于 Linux 主机，且端口映射在该模式下不生效。[Docker host 网络文档](https://docs.docker.com/engine/network/drivers/host/)。

## 启动与检查

在固定提交的工作树运行：

```sh
docker compose --env-file /etc/ma24/pilot-host.env -f deploy/pilot/compose.web.yaml config --quiet
docker compose --env-file /etc/ma24/pilot-host.env -f deploy/pilot/compose.web.yaml up -d
docker compose --env-file /etc/ma24/pilot-host.env -f deploy/pilot/compose.web.yaml ps
```

`config --quiet` 用来校验配置，避免把解析后的 `DATABASE_URL` 打印到终端日志。Compose 插值变量与容器 `env_file` 是两层不同配置。[Docker Compose 环境变量文档](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)。容器健康检查只证明匿名会话 HTTP 路由可用，不证明数据库、资料 worker 或业务质量。

将 [Caddyfile](Caddyfile) 安装到目标主机的 Caddy 配置位置，并给 Caddy 服务提供 `PILOT_DOMAIN` 和 `PILOT_WEB_PORT` 环境变量。可以在 systemd 的 Caddy 服务覆写中使用 `EnvironmentFile=/etc/ma24/pilot-host.env`，然后重新加载服务管理器、验证 Caddy 配置并启动服务。Caddyfile 将域名 HTTPS 反向代理到本机 Web 端口；`{$PILOT_DOMAIN}` 是 Caddy 解析时环境变量，不是 Compose 变量。[Caddy 环境变量文档](https://caddyserver.com/docs/caddyfile/concepts#environment-variables)。目标域名证书、DNS、外部访问和浏览器安全 Cookie 均须实际核验。

上线前在目标 HTTPS 域名以真实团队测试账号逐项核对登录、退出、两账号隔离、手动线索写入/回读、错误路径、备份恢复、并发资源观察及停止写入后的实际回切。记录镜像与数据库版本、回切触发条件和结果后再发邀请。当前 G02–G13 与 G14–G16 未完成的功能和质量门槛仍按各自验收条件处理；Web 可启动不代表这些功能已上线。生产环境不要使用 `docker compose down --volumes`，它会删除上传持久卷。
