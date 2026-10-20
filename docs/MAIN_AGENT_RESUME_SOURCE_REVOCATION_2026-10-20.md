# G02 人工恢复时共享来源撤回

## 实际终态

全新159数据库、固定1325b0b5实际Web/API/编译Worker整轮退出0。来源改private后的首次本人HTTP恢复取得新租约，但只发布来源变化提示，旧checkpoint回答未发布、提取为0；空队列不重放。恢复shared后第二次本人显式HTTP恢复取得另一租约，最终只写一份回答及一条提取任务，控制恢复事件共2条；原工具调用ID/输入哈希/输出完全保持，完成后恢复409且后续不重放。匿名401、另一账号404、首次SIGKILL未提交回答回滚、正常停机/状态卷读回和响应丢失基线均通过。

类型及定向lint通过，0模型/外部动作，专用卷/网络/容器已清理，原三个服务运行。下方“运行中”为实施阶段历史；不扩称来源管理UI、真实模型或所有撤销类型已验收。[结构化证据](evidence/ma24-g02-http-resume-source-revocation-2026-10-20.json)。

## 验收范围

新增 `--main-runtime-resume-revocation`，复用真实API最终写入中断和已登录Web控制流程。产品镜像固定 `1325b0b5`，新增验收脚本在宿主执行，不算入旧镜像内容。

用例要求：

1. 在实际最终回答INSERT等待时SIGKILL API，核对未提交回答不发布，Worker仅保存一次连接中断partial。
2. API替换后空队列不自动恢复；匿名恢复401、另一账号404。
3. 把另一合成账号拥有的共享文档改为private，再由本人通过真实HTTP恢复任务。新租约执行必须保持partial、返回来源变化提示，不发布旧checkpoint回答，不创建提取任务。
4. 空队列仍不自动恢复。只恢复该文档原有shared可见性，再次由本人显式恢复，必须取得另一租约并完成一份回答及一条提取任务；两次恢复各留一个控制事件。
5. 原工具调用ID、输入哈希和输出逐项不变；完成后恢复409，后续Worker不重放。

这是共享文档可见性撤回/恢复的实际工程验证，不是资料内容/版本/删除/原件撤销的完整矩阵，也不是首次真实模型或外部动作的中断恢复。完成态checkpoint和所有来源均合成，0模型/外部动作，无生产账号或业务数据修改。

## 命令与当前状态

```text
node scripts/run-tsx.cjs scripts/verify-ma24-fresh-pilot-new-cluster.ts --web-image=ma24-pilot-web:1325b0b5 --current-schema --main-runtime-image=ma24-main-agent-runtime:1325b0b5 --main-runtime-durability --main-runtime-resume-revocation
```

类型及两个验收脚本的定向lint已通过。实际用例运行中，日志 `tmp/ma24-http-resume-source-revocation-1325b0b5.log`；在退出及资源清理完成前不判通过。G01–G13继续，G14–G20和内网上线暂缓。
