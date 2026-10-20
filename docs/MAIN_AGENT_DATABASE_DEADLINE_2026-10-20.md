# G01 API/网络组合故障的数据库等待边界

## 当前实施

- 显式数据库期限仅作用于调用方指定的事务；未设置期限的其他流程保持原行为。取消会停止等待、丢弃借出的连接，迟到回调不能再使用该连接；迟到获得的连接直接丢弃。事务及未知COMMIT均不自动重试。
- 带期限事务在BEGIN后设置本事务的 statement_timeout 与 idle_in_transaction_session_timeout，防止客户端或网络消失后服务端长期持锁。繁忙后端可能直到服务器语句期限才退出，不能把客户端取消等同于服务端立即停止。[PostgreSQL 16官方说明](https://www.postgresql.org/docs/16/runtime-config-client.html)。
- Worker沿用既有90秒租约与20秒心跳周期：心跳无重叠且有20秒调用期限；失败/失去租约会取消API等待。中断保存只使用最后已确认租约窗口的剩余时间，确认起点取请求发送前的单调时钟，避免迟到响应延长窗口。不确认的保存只记有界诊断，不谎报partial已保存。
- API最终保存事务另设90秒传输上限，避免API与网络同时消失后原事务残留；所有原有数据库时钟、精确租约、来源与最终保存校验仍在，期限不授予新的租约或提交权限。

## 已完成组件验证

16项数据库回归通过，其中5项新增覆盖活动查询取消、迟到回调/获取连接、未知COMMIT不重放及服务器局部期限设置。类型与定向lint检查另见本轮终态。

一次性真实PostgreSQL验证已退出0：活动pg_sleep查询及空闲回调事务取消后，后端连接关闭、两次未提交写入回滚、后续连接读写和租户范围正常。验证使用专用10秒服务器保护期，不是产品新增的超时值。第一轮错误地仅等待1.6秒就要求繁忙后端消失，退出1；保留失败日志，按实际10秒保护期加轮询余量观察后的第二轮通过。

日志：`tmp/ma24-database-deadline-real-pool.log`（首次失败）、`tmp/ma24-database-deadline-real-pool-bounded.log`（通过）。未修改原数据库或全局服务器设置，0模型和外部动作。

## 固定镜像验收仍待完成

新增 `--main-runtime-network-loss`：保留首轮失败的API共享网络布局，在真实最终INSERT等待时杀死API及网络所有者；核对Worker有界退出、未提交回答不发布，真实等待租约过期/已确认partial后，在新网络中恢复为单份结果。不能强改租约或终止原数据库后端来伪造恢复。

```text
node scripts/run-tsx.cjs scripts/verify-ma24-fresh-pilot-new-cluster.ts --web-image=<same-source-web> --current-schema --main-runtime-image=<fixed-main> --main-runtime-durability --main-runtime-network-loss
```

尚不证明全部数据库入口/初始队列轮询断网、真实模型或外部动作中断、断电/异地一致恢复、持续负载和生产资格。G01–G13继续，G14–G20与内网上线暂缓。
