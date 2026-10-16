# MA24 固定提交数据库检查

命令：`node scripts/run-ma24-snapshot-check.mjs --prospective-composition`。也可单选 `--memory-source-locks`、`--transport-journal` 或 `--locked-policy`。

启动时解析 HEAD 为完整提交 ID，以 Git archive 在忽略的 `tmp/ma24-snapshot-*` 下展开独立源码。核对快照锁文件与当前锁文件一致后，链接已有 node_modules；不复制环境文件，不安装依赖。检查仍通过既有一次性数据库脚本执行，标准结果包含固定提交 ID。结束时先移除依赖链接，再清理经过绝对路径范围校验的快照目录。

已用提交 `9294c89705261fd188db2e71501443f1b5170338` 的 `--memory-source-locks` 实际验证通过，包括数据库并发回归和快照清理；定向 lint 通过。该次验证发生在附件提取修复之前，只证明运行方式正常，不替代修复后的完整组合。

快照使主工作区可继续开发，不改变正在验证的 src。安装依赖仍为本机共享目录，必须保持稳定；此工具不提供完整依赖或生产二进制认证。真实质量和生产部署依然分别验收。
