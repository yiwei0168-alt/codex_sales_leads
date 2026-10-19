# Skill 原件的当前进程只读挂载证据

G09 附件与知识工具回执的原件核对新增独立字段：`attachmentReadOnlyMountVerified`、`knowledgeReceiptReadOnlyMountVerified`。字节校验通过与挂载保护分别报告；不把二者等同，也不授予自动启用。

## 实现边界

- Linux 上打开原件，通过 `/proc/self/fdinfo/<fd>` 的 `mnt_id` 对应 `/proc/self/mountinfo` 的唯一记录，检查每挂载选项 `ro` 且无 `rw`。不靠路径前缀推断，也不把只读父挂载延伸到可写子挂载。
- 只读 bind mount 可以有可写 superblock；本检查只报告当前进程访问该文件的挂载视图。字段定义见 [Linux 内核 proc 文档](https://docs.kernel.org/filesystems/proc.html)。
- 检查前后核对规范路径、设备、inode、长度及时间。无效路径、缺失文件、不可读或不合法 proc 信息、非 Linux 平台均返回 false。零原件时 true 只表示没有待检查的文件，必须结合数量解读。
- G09 准备结束重新进行既有字节校验和本项检查；附件或知识回执的挂载保护状态发生变化时拒绝返回准备结果。

## 尚未满足的完整保护

这不是不可变存储证明。宿主机、其他进程或其他挂载视图可能仍可修改同一 backing store；管理员也可能修改挂载状态。本检查不授予文件租约，不覆盖之后的提交窗口，未证明所有写入路径隔离。`sourceRevocationsLocked`、`collectorProvenanceVerified` 和 `automaticActivation` 仍为 false。完整来源撤销、受控不可变存储、可信生产身份、真实质量与最终启用事务继续待办。

## 验证

75 项定向回归通过，包含只读父/可写子挂载、描述符实际挂载选择、重复/缺失/不合法 proc、原件篡改、附件/知识挂载保护漂移及既有签名/时效拒绝。另在现有 Linux 镜像上实际运行当前源码编译的探针：只读资料 bind mount 检查 true 且真实写入被拒绝；同一目录可写挂载检查 false 且真实写入成功。容器无网络、非 root、移除 capabilities，运行后自动删除。

这两次探针不代表重建了产品镜像，也不代表当前源码完整 G09 签名组合或生产验收。详细记录见 [收据](evidence/ma24-g09-readonly-mount-protection-2026-10-19.json)。
