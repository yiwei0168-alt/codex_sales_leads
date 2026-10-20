# 普通检查点租约保护的固定包与 Worker 验收

对应既有 MA24-06，无新增用户确认。产品提交 `d2bde5b9f2bba1334f1930fdb9ff93eafd092038`，三镜像均从该固定 Git 归档构建，构建及各项包检查退出码均为 0。

| 镜像 | 不可变 ID |
| --- | --- |
| `ma24-main-agent-runtime:d2bde5b9` | `sha256:a712dfe1f92242fea991804fa7def24ef0f0772dc07f2d4b621ca28ca6f346ee` |
| `ma24-skill-collector:d2bde5b9` | `sha256:f71db6c5175f9f0bd5d2ca8b18c49cae9883dce7c583892bf31703468b1b3cf1` |
| `ma24-pilot-web:d2bde5b9` | `sha256:26767d40e936c1b265312f600db2a8c4a3d67a67157033bc1c3ea93f1255f0ae` |

## 已通过

双包 1020 源码输入、Node 24.21.0 与二进制、33503 依赖文件及 ESM 一致。采集器 34536 文件包、测量登记、只读/非 root/无网络及篡改拒绝通过；Web 源码与固定 Git 导出一致，BUILD_ID `eXHhSx7gLB4JzIO3B0m_j`，静态资源存在，无私密环境/业务存储文件。[包测量与日志摘要](evidence/ma24-g01-g09-checkpoint-fixed-packages-2026-10-21.json)。

实际固定 API/队列 Worker 会话 50700 在新建 169/TLS verify-full/内部网络中退出 0：

- 实际认领任务与 PostgreSQL 检查点恢复；源可用时完成并只创建一个记忆抽取作业，源撤回时部分完成且不创建抽取作业。
- 合成的已完成 Skill 回执只回显一次；started 无回执返回 unknown，不执行原工具。
- 禁用 Skill、原有回执保持不变，没有新增启用或工具起始事件，实际模型尝试为 0。
- API、Worker 与临时数据库已清理。[完整 Worker 收据与范围](evidence/ma24-g09-checkpoint-fixed-sdk-worker-2026-10-21.json)。

该 Worker 案例预先种入合成检查点与回执，未运行首次模型请求，未注入原始执行时的崩溃或未知 COMMIT，不构成真实业务质量。

独立正式采集器 TLS 声明会话 10438 退出 0：可信 CA/受限账号、签发回读及复用、登记禁用等待提交与身份/用途/撤销等拒绝通过并清理。[TLS 证据](evidence/ma24-g09-checkpoint-declaration-tls-2026-10-21.json)。这不代表整组生产入口包装器/TLS。

## 仍在执行与保留门槛

固定 d2bde5b9 的 Linux 五类/八任务、测量登记、普通共享控制和历史提交后 SIGKILL/默认租约自然到期恢复会话 1418 正在执行，尚未验收。上一版本 5957f402 的同类组合已退出 0 并清理，但不能移植到本版本。

候选私有检查点协议、完整普通/候选执行统一与使用生命周期、其他题型专项故障、整组生产身份/入口及独立真实质量仍待完成。没有 Skill 启用或产品部署，G14–G20 和上线继续暂缓。
