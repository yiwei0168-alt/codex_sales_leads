# G03 实际本地记忆 Worker 流程（2026-10-19）

## 执行与结果

独立全新 156 数据库、合成账号与空记忆队列中，实际启动 `scripts/run-local-memory-worker.ts --once` 三次，没有以直接服务函数替代 Worker：

1. 入队 `I prefer long reports.`，真实取队列并持久化偏好，任务 ready，收据指向确切消息。
2. 入队明确自然纠正，真实取队列并持久化 `I prefer concise reports.`，对应原偏好的唯一纠正，任务 ready。
3. 队列已空，进程正常退出，没有再次调用模型。

两条观察各有一条通知及一条图谱 outbox；正式事实及评分政策计数前后相同。实际本机 Qwen chat 两次、tags 两次，三个独立 Worker 进程均正常退出；该次临时 Web/数据库/网络已清理。

固定 `qwen3:8b`，服务声明 digest 为 `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`。回环 relay 只允许 `/api/tags` 和 `/api/chat`，原样转发实际响应、禁止重定向并限制最多四次 chat；不返回模拟回答。Worker 使用临时受限应用数据库连接，云模型密钥及 tracing 配置在子进程中置空/关闭。原始合成模型响应仅留本机 tmp，公共收据保留其哈希。

[实际进程、模型与环境收据](evidence/ma24-g03-actual-local-memory-worker-2026-10-19.json)。本地脚本 `--local-memory-worker` 参数必须同时带 `--web-image` 与 `--current-schema`，模型调用只发生在该显式验收选项中。

## 范围

这是 Worker 启动、队列选择、持久化与两个合成英文输入的实际本地模型检查；不是代表性质量评测、自然发生的真实业务样本、持续运行试点、Web 操作或图谱消费。模型 digest 来自服务声明，不是权重/二进制认证。本轮不重验撤销/双时间历史，既有服务级证据分别保留。

没有改动产品 Worker 实现或业务数据库，没有启用正常环境中的抽取开关，不批准正式事实、政策发布或 Skill 自动启用。G03 整体及真实质量仍未完成。
