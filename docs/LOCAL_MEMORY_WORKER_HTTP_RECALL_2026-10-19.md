# G03/G04/G13 同批中文 Worker、登录接口与撤销召回

## 实际链路

使用全新临时 PostgreSQL 迁移至 156、两个合成用户，宿主机记忆实现来自 `24585233`；Web 使用既有固定 `ma24-pilot-web:d6ffb7a1`。本轮修改验收脚本，不修改产品接口或业务数据。

1. 实际本地 Qwen 三次 chat 完成中文偏好、自然纠正和客户引语；四次抽取 Worker `--once` 含空队列。原句整理回执、引语不入库和未知业务日期保留通过。
2. 两条有效观察经实际图谱 Worker 投影。真实本地图谱查到原记录与纠正记录两个候选；正常 `searchMemoryWithGraph` 使用这份实际候选快照，在 PostgreSQL 重新检查当前状态，当前只返回纠正记录，业务有效性仍标 unknown。
3. 通过产品登录 cookie 读取 `/api/knowledge/observations?view=timeline`。本人看到原记录/纠正关系；另一账号读不到记录，尝试撤销返回 404。本人撤销已被纠正的旧记录返回 409。
4. 本人 POST 撤销当前纠正记录成功；重复请求复用同一不可变 invalidation，时间线保留原记录、纠正、撤销三者，通知/outbox 各一次。
5. **在撤销记录投影前**再次执行真实本地图谱查找，仍取得原来的两个陈旧候选。PostgreSQL 当前复核返回空，不复活旧偏好或已撤销纠正；按原记录及纠正的精确数据库 recorded_at 分别回读历史，两次都保留当时版本。
6. 撤销记录由实际图谱 Worker 投影，再执行空队列；四次图谱 `--once` 共三条一次投递，租约清空。清理仅限本轮 owner/observation UUID，临时 Docker 集群自动删除。正式事实/政策计数不变。

图谱两次物理查询分别产生候选，当前和历史复核复用各自查询的实际 ID 快照，不伪造图谱候选；历史/撤销结果由正常 PostgreSQL 校验路径决定。召回验证子进程的私有 stdin 传递本轮 UUID 和精确知识时点，不传密码或私有业务数据。

## 验收记录

命令：`node scripts/run-tsx.cjs scripts/verify-ma24-fresh-pilot-new-cluster.ts --web-image=ma24-pilot-web:d6ffb7a1 --current-schema --local-memory-worker --local-memory-chinese --local-memory-graph-worker --local-memory-http`。

退出 0；类型及定向 lint 通过。日志 `tmp/ma24-chinese-worker-http-recall-2026-10-19.log`，本地原始合成模型输出保留在收据的 rawDirectory。模型名/摘要限定与此前中文 Worker 相同；本机图谱/嵌入查询不计入抽取 relay 的三次 chat/tag 数量。[结构化证据](evidence/ma24-g03-g04-g13-worker-http-recall-2026-10-19.json)。

## 未完成

这是同一批合成数据的有限工程链路，不是独立质量、真实用户数据或连续运行试点。Web 是较早的固定镜像，宿主机 Worker 为当前实现；不是最终统一候选、迁移 157 验收、浏览器 UI/HTTPS 重验或上线交付。未覆盖所有记忆入口和任务生成过程中的撤销，G02/G03/G04/G13 仍保留对应门槛；G14–G20 及内网部署继续暂缓。
