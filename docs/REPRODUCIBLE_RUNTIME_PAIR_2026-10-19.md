# G01/G09 固定运行包构建与核对（2026-10-19）

2026-10-20 普通主任务包：`66924a48` Web/主 API-worker 镜像已通过同源/Node、受限包和真实队列/API/checkpoint 恢复的正常与撤回分支；不是采集器镜像。下方 `dddb9bfc` 仍是单独的 Web/Skill 采集器已验组合，不能跨提交拼成同一认证候选。[主任务范围](MAIN_AGENT_RUNTIME_ACCEPTANCE_2026-10-20.md)。

最新双镜像已固定到 `dddb9bfc`，源码/Node 指纹、入口、迁移 157 Web/恢复、数据库模式 Linux 声明及当前十套合成 UI 分别通过；旧 `d6ffb7a1` 收据保留为历史。完整依赖/提供方/真实质量和最终启用仍未完成。[当前固定包范围](RUNTIME_PAIR_DDDB9BFC_SCHEMA157_2026-10-19.md)。

## 修复

- Web 的 builder/runtime 基础镜像与采集器共用既有 Node 24 Bookworm slim 摘要 `sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6`，消除浮动标签更新造成的潜在 Node 差异。
- 两个构建器先解析并校验确切 commit，随后 `git archive` 使用该 commit，不再再次读取可变化的 HEAD。归档、日志及镜像 revision label 绑定同一个值。
- Web 增加 revision label。运行包对比先解析不可变镜像 ID 与 40 位 revision，两份 revision 必须相同，再按镜像 ID 启动无网络/只读检查容器，避免两次操作间标签变化导致检查另一个镜像。

校验仍比较源码/配置输入、Node 版本/平台/架构及实际 Node 二进制摘要；可顶层解析的依赖与锁文件核对。Next 打包内部依赖的完整执行等价性仍未证明，不能因源码/Node 一致就设 `completeDependencyRuntimeEquivalenceVerified` 或 `productionQualified=true`。

## 当前阶段

后续同一采集器镜像的实际 TLS 声明矩阵已退出 0，镜像 ID 和测量 deploymentHash 与入口矩阵一致：签发/回读/重试、权限与绑定、错误用途/禁钥/撤销/到期、错误 TLS 根及部署哈希、Node 参数拒绝通过。临时容器/网络清理；未创建生产密钥或人工批准。[声明终态](evidence/ma24-g09-fixed-runtime-declaration-d6ffb7a1-2026-10-19.json)。下面“声明仍运行”为此前记录，以此终态为准。

固定 `d6ffb7a14a773546b0a934bfe4260197d3cd6bba` 双镜像构建、同 revision/不可变镜像 ID 检查、956 项源码输入和实际 Node 二进制相等检查均已通过。Node 为 24.21.0，linux/x64。缺 revision 与混合 revision 负例均明确拒绝；最初缺标签触发 Docker 模板错误，宿主校验器改用可空标签解析后重跑正反例通过。[固定包收据](evidence/ma24-g01-g09-fixed-runtime-pair-d6ffb7a1-2026-10-19.json)。

Web ID `sha256:95875c83d9caab7d4fd018caff9f6fb99b26f5b0676ae9e4d7e07cb2dc585171`；采集器 ID `sha256:dcc60f52061956eb1f58e4baa62e4f11c6d1083e84d4c3503a09b214205975c1`。采集器 34,471 文件清单、测量登记和已有实际启动/篡改/运行边界拒绝矩阵通过。Web 全新 156/TLS 库、HTTPS 浏览器、十合成账号隔离和快照下载通过。

宿主校验器的标签诊断修复晚于镜像构建提交，仅影响核对工具，收据绑定其实际脚本哈希；不把它写成镜像内代码。实际 TLS 声明签发矩阵另在运行，不计入上述已通过范围。

Next 内部打包的五项依赖仍无法由此检查顶层解析，完整依赖执行等价性为 false；这不是断言它们运行时缺失，也不能用锁文件版本替代执行认证。生产及自动启用资格仍为 false。

以下为实际构建前的阶段记录，当前结果以上文及收据为准。

脚本语法与差异检查通过。实际验证需要先固定提交，再分别运行两个 Git archive 构建器和运行包对比。此阶段记录不表示镜像构建或运行包对比已经通过；实际结果将另记固定提交、镜像 ID 和原始收据。
