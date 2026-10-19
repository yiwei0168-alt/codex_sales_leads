# G01/G09 固定运行包构建与核对（2026-10-19）

## 修复

- Web 的 builder/runtime 基础镜像与采集器共用既有 Node 24 Bookworm slim 摘要 `sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6`，消除浮动标签更新造成的潜在 Node 差异。
- 两个构建器先解析并校验确切 commit，随后 `git archive` 使用该 commit，不再再次读取可变化的 HEAD。归档、日志及镜像 revision label 绑定同一个值。
- Web 增加 revision label。运行包对比先解析不可变镜像 ID 与 40 位 revision，两份 revision 必须相同，再按镜像 ID 启动无网络/只读检查容器，避免两次操作间标签变化导致检查另一个镜像。

校验仍比较源码/配置输入、Node 版本/平台/架构及实际 Node 二进制摘要；可顶层解析的依赖与锁文件核对。Next 打包内部依赖的完整执行等价性仍未证明，不能因源码/Node 一致就设 `completeDependencyRuntimeEquivalenceVerified` 或 `productionQualified=true`。

## 当前阶段

脚本语法与差异检查通过。实际验证需要先固定提交，再分别运行两个 Git archive 构建器和运行包对比。此阶段记录不表示镜像构建或运行包对比已经通过；实际结果将另记固定提交、镜像 ID 和原始收据。
