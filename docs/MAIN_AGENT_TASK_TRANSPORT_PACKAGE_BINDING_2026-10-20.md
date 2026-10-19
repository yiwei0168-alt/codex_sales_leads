# G01/G09 原任务签名与主运行包绑定

## 实施范围

沿用 MA24-06，不新增用户确认。普通主运行入口在完整包清单/Node 字节核对和非 root、只读、capabilities 等边界检查后，计算实际清单的 SHA-256。只要以下任一变量非空，即要求 `TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256` 是完整 SHA-256 且等于实测值：

- `TASK_MODEL_TRANSPORT_KEY_ID`
- `TASK_MODEL_TRANSPORT_PRIVATE_KEY_FILE`
- `TASK_MODEL_TRANSPORT_COLLECTOR_ID`
- `TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256`

API/Worker 的实际启动还要求四个变量均非空，缺项或错配在数据库/业务处理前拒绝。未配置签名的运行方式保留。`--verify` 总是输出实测 deploymentHash；检查模式允许仅提供匹配部署哈希，返回的绑定标记只说明这一配置与包匹配。

入口不在检查模式读取私钥；私钥内容、当前登记、提供方及请求/来源权限仍由原请求工厂在实际请求时检查。四个配置变量齐全不表示私钥文件存在或签名已成功，也不表示包/提供方获得生产资格。所有生产/自动启用标记仍为 false。

## 验收编排

新一次性选项 `--main-runtime-task-enrollment` 配合 `--main-runtime-image`、`--web-image`、`--current-schema`：

1. 无登记配置的实际镜像检查，独立读取清单文件字节的摘要，与入口实测值一致。
2. 只提供匹配哈希的检查成功。
3. 六类拒绝：检查时错配/非法哈希、运行时缺少部署哈希/仅哈希但缺其余配置/缺私钥路径变量/完整配置却部署错配；均须在绑定阶段退出。
4. 配置使用明确未登记的合成 keyId/collectorId、未挂载的合成私钥路径及实际部署哈希，启动真实 API/编译 Worker 恢复合成完成态 checkpoint；本轮不进入模型签发，不读取签名私钥。

当前 20 项包清单/运行边界测试、语法、类型和定向 lint 通过。固定新主运行/Web 镜像、源码/Node 配对及实际配置/数据库链待构建后验证；准备编排不记为已通过。

## 后续范围

固定当前源码分别构建主运行包和 Web，核对相同 source commit、源码/Node，再运行上述明确配置验收。真实原任务模型/签名全链、提供方认证、完整来源保护、真实质量、最终启用及生产仍未完成。G14–G20 和内网上线继续暂缓。
