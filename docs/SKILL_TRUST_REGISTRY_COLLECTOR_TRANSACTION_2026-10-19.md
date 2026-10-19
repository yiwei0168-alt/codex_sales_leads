# G09 采集器声明签发的登记事务

## 实现

数据库登记模式下，`appendConfiguredSkillRunnerAttestation` 的签名前登记读取和 `appendSkillRunnerAttestation` 的两次声明验证均复用传入的采集器连接；不再另开应用短事务读取登记。

采集器专用读取验证账号、`network_copilot_skill_collector` 角色、非 SUPERUSER/BYPASSRLS 及稳定事务 ID，然后使用与应用复核相同的非阻塞登记共享锁和严格格式/摘要校验。操作前后重新检查账号、角色和事务身份。共享锁保持至外层采集器事务提交或回滚，数据库登记发布禁用版本须等待该事务结束。文件模式继续每次重读，不获得该保证。

## 实际验证

命令：`MA24_DECLARATION_DATABASE_TRUST=1 node scripts/run-tsx.cjs scripts/verify-ma24-fresh-pilot-new-cluster.ts --runner-attestation`。

- 新建 Docker 临时 PostgreSQL：基础迁移至 135，声明及来源锁夹具按原脚本安装，额外安装 157，不应用推迟的质量评测迁移。
- 实际编译原生 CLI `--attest` 在数据库模式签发声明、服务器回读、重复运行复用已有声明，通过。
- 实际追加逻辑返回后，禁用登记的发布连接被准确的采集器事务 PID 阻塞；外层提交后禁用完成。文件登记刻意保持 enabled=true，下一次 CLI 和服务器读取仍因数据库禁用拒绝，不回退文件。
- 跨账号、合成来源、调用方绑定、应用登录、错误私钥/用途/密钥、Node 参数和撤销拒绝均通过，拒绝不新增声明行。
- 独立临时数据库验证采集器读取拒绝应用角色、跨账号和拥有正确角色但未显式开启事务的连接。64 项声明/最终材料回归、类型和定向 lint 通过。

本轮已退出 0，临时集群及测试材料由夹具清理。结构化证据：[数据库声明签发](evidence/ma24-g09-database-trust-collector-declaration-2026-10-19.json)。

## 范围

仅合成材料和临时测试密钥，模型调用 0，没有生产密钥、人工批准或自动启用。此为修改工作区中的原生编译 CLI 验证，不是 Linux 镜像矩阵、固定 Git archive 或数据库模式任务传输/完整五类组合的重验。之前五类组合的文件签发/数据库最终复核证据继续单独保留。

生产运行包/提供方认证、全部来源保护、真实质量和最终启用事务仍未完成；本轮不关闭 G09，不推进 G14–G20 或内网部署。
