# G09 当前数据库版本下的完整签名组合

## 联合验收终态

全新162顺序初始化后的完整配置签名五类流程退出0：两条原任务/八个评测臂、五类统一材料、实际ESM声明CLI、附件不可变快照与撤销/恢复、数据库信任登记禁用等待readiness事务提交均通过。登记表存在但无登记记录时正确返回 `package-registration-missing`，缺人工判定仍阻断；Skill未启用。执行在Windows宿主，模型/网络/预算适配仍合成，实际模型调用0，不是固定Linux五类流程、真实质量或生产资格。[终态证据](evidence/ma24-g09-current162-signed-composition-2026-10-20.json)。

固定b4e75e97采集器非root/只读/无网络、部署绑定及缺失/错误配置、Node参数注入、篡改拒绝检查也退出0。当前162库的固定镜像TLS声明检查首次在最后一条“旧版库不应有评测表”断言失败，前面的声明检查没有报错，但整个首次运行不能判通过。夹具现根据显式current-schema核对表存在性，不执行评测；保留失败日志，数据库信任模式下的重跑仍在进行。两文件类型/lint已通过。

以下为本阶段启动时记录，其中“运行中”由上方终态分别取代；TLS重跑仍待终态。

对应MA24-06。本阶段让 `--current-schema --transport-journal` 显式使用全新162顺序初始化，保留默认旧版本夹具路径。快照入口也允许传入这一组合，以及既有locked-policy的current-schema选项；其他夹具仍拒绝不支持的组合。

完整签名五类夹具现在区分“没有运行包登记表”和“已有登记表但没有登记记录”。两者均拒绝生产资格，不能把当前数据库中缺记录误报成缺表，也不为通过测试制造运行包登记。

类型检查与三个文件ESLint通过。以下实际联合验收的启动命令为：

```powershell
$env:MA24_CONFIGURED_COMBINED='1'
$env:MA24_DATABASE_TRUST='1'
node scripts/run-tsx.cjs scripts/verify-ma24-fresh-pilot-new-cluster.ts --current-schema --transport-journal
```

本轮临时库中的模型、网络和预算适配仍为合成。完整签名组合要求实际配置签发、两原任务/八评测臂、五类材料重建、数据库信任撤销等待及缺人工判定阻断；并非新真实模型或质量批准。当前日志位于 `tmp/ma24-current162-composition-db.log`。

已从独立已提交源码 `b4e75e974af42f0a8c093e5a964dfd982e63e50a` 成功构建主运行/采集器固定Linux镜像，构建日志分别为 `tmp/ma24-b4e75e97-main-build.log` 和 `tmp/ma24-b4e75e97-collector-build.log`。不可变镜像完整性与991源码输入、Node24.21、33503依赖字节和ESM成对核对退出0，实际摘要见[阶段证据](evidence/ma24-g09-current162-composition-preparation-2026-10-20.json)。采集器边界与全新162五类组合仍未取得终态；包检查不等于固定Linux五类执行或生产资格。两项操作不写业务库、不部署或开放服务。G09未关闭，G14–G20及上线继续暂缓。
