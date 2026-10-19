# 首批团队试用新托管实施单（2026-10-16）

2026-10-19 本地候选更新（未上线）：固定 `e36ac0f5` 的 Linux Web 镜像已构建，949 个运行源码文件与该提交 Git 导出逐字节一致；导出与 Git blob 的差异仅为 LF/CRLF。实际隔离验收使用 `--web-image=ma24-pilot-web:e36ac0f5 --current-schema --browser --ten-user`，全新数据库安装至 153，HTTPS 浏览器和十合成账号隔离通过，临时服务/网络已移除。新的当前结构模式只用于隔离 Web 验收；历史 G09 仍从 135 启动自己的固定夹具。该结果不恢复内网上线，不代表全部业务或生产验收。[收据](evidence/ma24-g01-current-linux-web-2026-10-19.json)。

## 当前方案（2026-10-19）

用户确认首批最多 10 人统一由公司 LAN 访问，按不配置 ICP 备案域名执行。部署目标调整为公司可管理的内网 Linux 主机/VM；目标 LAN IP 由用户提供为 `192.168.0.170`，需在目标主机确认该 IP 已固定且未冲突。只使用内部 DNS、Caddy 内部 CA，不配置公网 DNS、公网 IP/NAT 或互联网入站。远程办公成员须先接入公司 VPN。内部 DNS 名称、允许的 LAN/VPN 网段和设备证书分发管理员信息未提供，尚未部署或创建邀请。

Web 模板仍只绑定主机回环地址；Caddy 模板已调整为仅绑定显式配置的 LAN IP、使用内部 TLS，并为同一 LAN IP 上的 HTTP 请求做 HTTPS 跳转。主机防火墙应只允许公司办公网/VPN 子网访问 TCP 443；目标环境须实际验证外部网络拒绝、内部 HTTPS 受信任、登录/隔离、备份恢复和回滚后再邀请。首批只用全新测试数据。若将来从公网开放，需重新评估备案、托管与数据要求。

2026-10-16 两成员线索补验：Linux Web 与全新恢复库中，两位合成成员分别登录；成员 A 手动新增的待核实公司由 A 回读可见、在 B 的工作区不可见，B 直接按公司 ID 修改返回 404，A 的记录不变，付费预留 0。一次性容器连同合成数据已清理。[业务收据](evidence/ma24-g01-linux-fresh-db-two-member-lead-2026-10-16.json)。此范围只覆盖单条手动公司和两账号，不代替目标 HTTPS、真实团队账号或全部租户路径验收。

2026-10-16 合成成员登录补验：Linux standalone Web 接全新归档恢复库，合成成员登录 200、会话认证、空上传列表 200、退出后旧 Cookie 失效；响应 Cookie 含 Secure/HttpOnly/SameSite=Lax。合成账号与会话均归零，临时容器已清理。[登录收据](evidence/ma24-g01-linux-fresh-db-synthetic-login-2026-10-16.json)。这仍是本机 HTTP 请求检查，目标可信 HTTPS、真实成员隔离和业务写入待验。

2026-10-16 Linux Web＋新恢复库联合补验：再次从 ACL 归档恢复全新本机 PostgreSQL 容器，Linux standalone Web 用受限登录连接；首页和匿名会话 GET 为 200，未登录上传 GET 为 401。临时数据库仅映射本机回环端口，测试容器已清理。[联合收据](evidence/ma24-g01-linux-fresh-db-integrated-smoke-2026-10-16.json)。这验证本机异构容器的最低运行组合，目标域名、真实账号和业务写入仍待验。

2026-10-16 全新数据库容器补验：使用未发布端口的全新 PostgreSQL 16/pgvector 实例，先建受限应用、登录和 Skill 采集全局角色，含 ACL 的归档直接恢复成功。127–135 八项标记、关键授权、两表强制 RLS 通过；登录角色可切换到应用角色读取，不能切换到采集角色。扩展为 pgcrypto 1.3、plpgsql 1.0、vector 0.8.6；临时容器已清理。[恢复收据](evidence/ma24-g01-fresh-cluster-restore-2026-10-16.json)。这证明归档在新集群上可恢复的一个本机路径，不代替目标云主机实际恢复。

2026-10-16 Linux 包补验：提交 `7d7acf39` 的 Git 归档在本机 Docker 的 Node 24 Linux 镜像中完成安装、Next 16.3.4 生产构建与类型检查；standalone 包有 2,235 个常规文件、51,675,977 字节、2 个可解析相对链接、无 `.env` 文件。容器保持本机数据库回环地址，使用受限应用账号完成首页和匿名会话 GET 200；容器与临时环境文件已清理。[构建与冒烟收据](evidence/ma24-g01-linux-standalone-local-smoke-2026-10-16.json)。这关闭了 Windows 包不能直接当 Linux 包使用的构建风险，但云端 HTTPS、真实团队账号和业务写入仍待验收。

## 已确认范围与选择条件

- 已确认：新托管；首批成员主要在中国大陆；同时使用不超过 10 人。产品规则为 [PILOT-01](CONFIRMED_PRODUCT_RULES.md)。
- 用户已确认目前没有可用的 ICP 备案域名，首批仅用全新测试数据；真实应用阶段需要真实业务数据。试用阶段不迁移现有真实客户、邮箱或员工数据。云账号、试用域名和所有权仍待确定；尚未购买资源或部署。[阶段规则](CONFIRMED_PRODUCT_RULES.md)。
- 若有适用备案域名，优先选中国大陆、接近团队的节点。若无备案而仅用全新测试数据，可先考虑中国香港节点做小范围试用，须先从团队实际网络测可用性和延迟，再发邀请。香港节点不要求大陆 ICP 备案，但大陆跨境访问可能出现延迟或丢包。[腾讯云备案说明](https://cloud.tencent.com/document/product/243/19630/)、[地域与连通性](https://cloud.tencent.com/document/product/1207/50103)。
- 若需把现有真实个人信息迁往香港，先明确数据种类与处理依据，完成必要的个人信息出境评估和告知等工作；不把 10 人试用直接视作豁免。相关规则有特定豁免条件，不能仅凭用户数量判断。[国家网信办规定说明](https://www.cac.gov.cn/2024-03/22/c_1712776612187994.htm)、[个人信息保护法](https://scjgj.cq.gov.cn/zfxxgk_225/fdzdgknr/lzyj/fg/202204/W020230106411772820729.pdf)。

## 最小部署拓扑

建议先用一台 Linux 云服务器承载 HTTPS 反向代理、固定版本的 Next.js standalone Web 与 PostgreSQL 16/pgvector，数据库只监听内网/本机，Web 使用受限数据库账号。使用独立数据盘或持久卷、数据库逻辑备份和异地备份副本；备份恢复需在云端一次性库复验。服务器不是现有 Windows 本机的公网映射。

首轮只开放登录、工作区、任务读取和手动线索录入/回读。BGE、LangGraph、主 Agent、资料处理、邮箱/线索后台 worker、外部模型和自动外联另列运行依赖，按功能实际验收后再开放；现有 [发布计划](TEAM_PILOT_RELEASE_PLAN_2026-10-16.md) 的 G14–G16 质量和付费门槛不随试用放宽。需要完整产品体验时，必须补齐对应的常驻服务及真实业务验收，不能把只运行 Web 解释为全部功能上线。

以腾讯云轻量应用服务器作可选起点，按当前官方价目表，中国香港 Linux 通用型 4 vCPU/8 GiB/180 GiB 为 ¥320/月；大陆地域的同等资源有不同套餐与价格。此价格仅为服务器刊例参考，不包含域名、备份、证书/流量超额、模型或人工成本，购买前以控制台报价为准。[官方价格总览](https://cloud.tencent.com/document/product/1207/73452)。云服务器支持 Docker 容器；自定义 Next.js 应用的 HTTPS 要实际安装与验证证书，不能假定控制台对所有镜像自动配置。[Docker 文档](https://cloud.tencent.com/document/product/1207/60329)、[HTTPS 文档](https://cloud.tencent.com/document/product/1207/84359)。

## 切换执行顺序

1. 确认节点/域名/数据范围，建立团队持有的云账号和域名，取得资源购买决定。密码、密钥和备份不经 Git 或聊天传递。
2. 固定试用版源码并用 [Dockerfile.pilot-web](../Dockerfile.pilot-web) 在 Linux 镜像内重建独立包；构建上下文须来自已提交的干净 Git 快照，不能直接把含本机私有文件的工作目录送入 Docker。目标服务器配置最小权限数据库角色、持久存储、HTTPS、日志和访问限制。Web 只接收受限 `DATABASE_URL`；[容器入口](../scripts/start-ma24-pilot-container.mjs)遇到迁移凭据或付费准入覆盖变量即拒绝启动。4 vCPU/8 GiB 只是首轮容量起点，须以目标环境资源观测和并发冒烟核实。
3. 为试用建立全新空库和受限登录角色，运行 `npm run db:migrate:pilot-fresh` 至 135；核对零真实用户、零业务资料以及应用角色权限。[本机空库收据](evidence/ma24-g01-fresh-pilot-schema-2026-10-16.json)。既有产品库归档不得发送到试用主机；本机历史恢复收据只证明以后迁移真实业务数据时有一条可再验证的工程路径。
4. 用专门的团队测试账号和虚构线索在目标 HTTPS 域名核对登录、账号隔离、手动写入/回读、退出、错误处理和新试用库的备份恢复；记录新旧包指针与停止写入及回切步骤，再发少量邀请。真实业务数据另列后续迁移验收。

当前状态：**方案就绪，尚未采购、部署或上线**。本机预检仍为 `readyForRelease=false`；无备案域名且仅用全新测试数据已确认，仍须确定团队持有的云账号和试用域名，并在目标节点完成网络、HTTPS、备份恢复与成员验收。

2026-10-16 镜像封装补验：`da8fd831` 的干净 Git 快照加入试用容器文件后，在本机 Docker 的 Node 24 Linux 镜像中重新安装依赖并完成 Next 16.3.4 生产构建。镜像以 `node` 身份运行，不含 `.env` 文件；空值的 `DATABASE_MIGRATION_URL` 和非空的 `PAID_CALL_STAGE_OVERRIDE` 均令入口拒绝启动。以本机已有产品库连接做最小冒烟时，首页/会话 GET 为 200，匿名上传 POST 为 401。临时容器和连接文件已清理。[镜像收据](evidence/ma24-g01-pilot-container-image-2026-10-16.json)。镜像仍未在目标云主机、域名、真实团队网络和 HTTPS 下验收；本机数据库冒烟也不是目标环境容量或恢复验收。

镜像构建现在使用 `node scripts/build-ma24-pilot-image.mjs`，可选第二个参数为镜像标签。命令从当前 `HEAD` 导出干净 Git 快照到 `.next-releases`，在快照中运行 Docker 构建，并清理临时上下文；未提交修改不会进入镜像。构建前先确认目标提交已推送，部署时记录完整提交 ID 和镜像摘要。`c402d769` 的脚本实跑构建通过，镜像仍不构成目标环境上线验收。[可重复构建收据](evidence/ma24-g01-pilot-image-reproducible-build-2026-10-16.json)。

目标 Linux 主机的 [Web Compose 与 Caddy 模板](../deploy/pilot/README.md)已做本机验证：Web 在 host 网络只监听回环地址，上传目录可由非 root 进程写入持久卷；本地 HTTPS 反向代理可读首页和会话，临时资源已清理。[本机模板收据](evidence/ma24-g01-pilot-host-compose-local-2026-10-16.json)。这不替代目标主机的公网 DNS、可信证书、真实数据恢复和团队访问验收。目标主机上运行前还须确定备案域名与数据范围。
