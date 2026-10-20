# G01/G02 最终写入中断与 HTTP 人工恢复

## 实际终态

使用独立网络容器的第二轮退出0，全新159数据库、固定c88d0c13实际Web/API/编译Worker通过。已观察实际最终INSERT等待后SIGKILL137；未提交回答未发布，单次安全partial保留；重启后的空队列不自动恢复。实际HTTP匿名401、另一账号404、本人resume200、新租约、恢复后最终回答仅一份/提取任务一条、恢复事件一条、完成后resume409及下一Worker不重放均通过。正常停机/线程读回、响应丢失不重放和Web隔离基线也通过。

专用网络容器、API/Worker/代理、数据库/Web容器及状态卷已清理，原三个服务运行。类型和定向lint通过，0模型/外部动作。下方“尚待终态”为实施阶段历史；首轮组合网络故障仍未通过，不将隔离后的成功替代该失败范围。[结构化证据](evidence/ma24-g01-g02-inflight-http-resume-2026-10-20.json)。

## 验收范围

新增 `--main-runtime-interruption`，要求固定 Web/主运行镜像、全新当前数据库和 `--main-runtime-durability`。本轮产品镜像仍固定于 `c88d0c13`；新验收脚本在宿主执行，不能声称它们已包含在旧镜像内。登录使用本轮全新合成账号，不复制业务数据，不输出密码或会话 Cookie。

用例在专用数据库中持有 assistant_message 表锁，通过 pg_blocking_pids 确认实际 API 最终回答 INSERT 正在等待，再对 API 容器执行 SIGKILL 并核对退出137。释放锁后核对原事务未发布回答、Worker保存一次安全partial，重启 API 后空队列 Worker 不自行恢复。随后走实际登录 HTTP 控制接口：匿名401、另一账号404、本人resume成功、领取新租约、恢复原完成态checkpoint、只发布一份最终回答及一条提取任务；完成后resume拒绝409，下一Worker不重放。

以上为新增用例的验收要求；实际终态另行登记，不把代码存在视为通过。数据和完成态checkpoint合成，未验证首次真实模型业务、外部动作未知结果、源撤回后的人工恢复、宿主断电或异地一致恢复。

## 首轮失败与编排修正

首轮 Worker 使用 `container:<API>` 共享网络。API被杀后，Worker对 pilot-db 的只读TCP探测返回 EAI_AGAIN；数据库留有 idle-in-transaction 连接，Worker未正常结束，不能判通过。完整ID核对后仅结束该临时Worker，使原清理执行；日志 `tmp/ma24-inflight-http-resume-c88d0c13.log` 退出1，原三个服务保留。

修正为独立临时网络容器承载 API/Worker 的共享网络，API被杀不再同时拆除 Worker 的网络。网络容器没有产品状态，最终清理。此修正用于隔离 API 进程故障；首轮暴露的 API/网络同时中断及数据库事务等待仍是独立未通过门槛，不由本轮隔离结果替代。

## 执行命令

```text
node scripts/run-tsx.cjs scripts/verify-ma24-fresh-pilot-new-cluster.ts --web-image=ma24-pilot-web:c88d0c13 --current-schema --main-runtime-image=ma24-main-agent-runtime:c88d0c13 --main-runtime-durability --main-runtime-interruption
```

修正后运行日志：`tmp/ma24-inflight-http-resume-anchor-c88d0c13.log`。类型检查、两个脚本的定向lint已通过，实际运行尚待终态。G01/G02整体、真实质量和生产资格仍未完成，G14–G20和内网上线暂缓。
