# 任务额度绑定后的固定包

既有 MA24-06；G01–G13，G14–G20 与部署暂缓。构建归档 `72baa00b753179fe2e976bf1629b09ad0f4eb667` 包含 `fb8ac00c` 的额度绑定实现。

## 已通过

| 包 | 不可变镜像 ID |
|---|---|
| 主流程 | `sha256:1c3987c2109fc45017103bf89d4e3d81531ee80ed3301d2c0bdd0d823a8f2cba` |
| 采集器 | `sha256:14cb5373a5a89b5f276f9148ea44ac2a7b05164edcb0569e3c2fde53afc86648` |
| Web | `sha256:112e8375ca05169e12bc4cc93969dd7e9d28ed0f62d24eb366b7f6589362d4fa` |

三包构建退出 0。1037 源码输入、Node 及二进制一致性、完整依赖字节/ESM、Web 归档源码与私有根目录排除，以及采集器只读/非 root/无网络、登记及篡改/NODE_OPTIONS 拒绝检查通过。采集器包 34553 文件，部署哈希 `fc31e7fbb152fab9ca2e64d271a25d657d339507fa66baea183822cd108190ec`。

原生针对性实库 **10694 退出 0**，文件信任模式下验证默认策略、变更额度不另建任务、额度 3 的自有完成回读、任务隔离/认领和历史配置入口。无模型日志的额度元数据完成不构成模型、质量或启用证明。首次 5484 因信任模式与组合配置不匹配在额度断言前退出，失败收据保留。

## 完整组合待验

测试夹具另增同一评估/臂以额度 3、4 并发创建的竞争，要求恰好一方成功、一方因选择改变拒绝，并且只存一个任务；成功的合成任务随后取消。Linux 完整组合必须出现该断言，以及默认绑定、变更额度拒绝和非默认完成回读断言。夹具语法、类型和两文件 lint 通过；并发竞争尚未实际执行。

随后补强了 UUID 匹配：评估查询按 UUID 的规范文本匹配，避免大小写别名绕过已存在任务查找；事务锁原本已按 UUID 规范化。并发夹具的一方使用大写别名、另一方使用小写，同一 UUID 分别选择额度 3、4。该小修的 11 项任务策略回归、完整类型和三文件 lint 通过，实际竞争待验。此修改不在上表 72baa00b 镜像中，需要重新固定版本，不能把旧包测量结果沿用为新源码通过。

后续完整组合还需核对新包的五类/八任务、来源复核、客户实时读取后 SIGKILL/自然到期恢复、防重复请求、测量登记及固定启动器复用。旧产品 768b621b/夹具 88c3c1b5 的 60396 已通过，不能替代本版。当前版本完整包装器/TLS、首次真实提供方、独立质量及完整运行资格仍未验收，自动启用保持不可用。

[源码、构建和验收收据](evidence/ma24-g09-task-bound-execution-policy-2026-10-21.json)。

## UUID 修复后的版本固定

源码与并发夹具已提交为 `47be31685735b1f9c9925660f6f421c2e203a3fc`。新的主流程/采集器/Web 构建分别运行于 **22470、82075、74460**，日志为 `tmp/ma24-task-policy-uuid-{main,collector,web}-build.log`。构建尚未验收；上表 72baa00b 及其测量结果保留为中间版本，新并发/完整组合必须使用匹配最终源码的镜像。

上述三个构建现均退出 0，1037 个源码输入、Node/二进制、完整依赖/ESM、采集器隔离/登记/篡改拒绝与 Web 源码/私有根目录检查也通过。最终镜像为：

| 包 | 47be3168 不可变镜像 ID |
|---|---|
| 主流程 | `sha256:0db364ba57150fe91b3bbba320b28ec462fdf4c5b6fa5553a0bc8e571ff0c45c` |
| 采集器 | `sha256:746cc13155c114e33bb9ca7c41d1c1109b258d460d76a37e7da87dda74381fd3` |
| Web | `sha256:86663553153d60fe6d27224edb006cc1339036f76e9aa59da67d60a847d48b8e` |

采集器 34553 文件，部署哈希 `86de457a779a9756151e63015000df75c1b5452e24b42f5a248d8b6a62000c09`。

- **9934**：同产品/夹具 47be3168 的完整 Linux 组合，含大小写别名/不同额度并发、策略回读、五类/八任务、实时读取后 SIGKILL/自然到期恢复、测量登记及固定启动器终态复用。日志 `tmp/ma24-task-policy-uuid-fixed-linux.log`。
- **66804**：当前采集器独立 TLS/数据库信任声明，日志 `tmp/ma24-task-policy-uuid-declaration-db-trust.log`；不替代整轮组合的 TLS/包装器。

两轮均运行中，不记实际验收通过；自动启用与完整生产资格保持未通过。


2026-10-21 / Settlement fixture follow-up: final-product Linux session 9934 exited 1 before composition acceptance. The unsettled-task audit correctly rejected at execution-policy admission, but its fixture asserted the previous error message. The fixture now requires the exact current rejection; product guards are unchanged. Separate collector TLS/database-trust log contains two passing result records; its session handle has expired, so no process exit code is claimed. Disposable containers are gone; the original three services remain. Full composition and qualification remain unaccepted. See [evidence](evidence/ma24-g09-task-bound-execution-policy-2026-10-21.json).


2026-10-21 / Corrected fixture frozen at `6b4f51c9` (product source remains `47be3168`). Typecheck 25005 and fixture lint 16287 exited 0. Full Linux rerun **37984** is running at `tmp/ma24-task-policy-settlement-fixed-linux.log`, using the same immutable main/collector images. Runtime source bytes must still match the images; the prior failed 9934 record is retained. No acceptance or activation inferred before terminal results.


2026-10-21 / Final composition acceptance: **37984 exited 0**, product `47be3168`, corrected fixture `6b4f51c9`, unchanged immutable main/collector packages. All 10 JSON records were inspected. Bound quotas, nondefault readback and case-variant UUID concurrent admission passed; the same freeze has five cases/eight ledger tasks. Live customer_timeline read, actual process termination, natural lease expiry/new-process recovery, preserved spec/capture/journals and no repeated completed HTTP steps passed, as did live-source revalidation, measured registration/provenance and fixed-launcher completed reuse. Temporary containers were removed; original three services remain. Whole-fixture production entrypoint/TLS, real model/provider/quality and activation are NOT established (actual model calls 0, qualification/activation false). Historical failed 9934 remains retained. [Evidence](evidence/ma24-g09-task-bound-execution-policy-2026-10-21.json).
