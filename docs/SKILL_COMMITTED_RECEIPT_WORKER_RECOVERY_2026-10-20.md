# G09 已完成启用回执的正式Worker恢复组件

对应MA24-06，无新增确认。验证固定正式LangGraph API和主队列Worker恢复待处理检查点时，会复用已完成skill_manage回执，且不改变已禁用Skill。仅为合成恢复组件，不是真实启用质量或原进程崩溃/未知COMMIT的联合证明。

## 验收入口与隔离

新增--main-runtime-only与--main-runtime-skill-receipt，要求--current-schema和固定--main-runtime-image，不混跑Web、浏览器或其他空库夹具。Runtime所在Docker网络必须Internal=true；数据库的宿主管理桥接连接与该内部网络连接分开，Runtime仅通过内部网络使用验证TLS。无Web部署、提供方凭据或外部业务动作。

夹具创建默认禁用的合成指令Skill，构造明确标为合成的已完成启用回执和仍待处理execute_tool检查点；固定正式Worker通过真实队列领取租约及LangGraph API恢复。检查点处于正式图既有80步上限的最后待处理调用，回执消费后由正式上限停止，避免任何模型请求。要求检查点仅回显一份旧回执，Skill/版本/绑定/发布状态和原回执不变，无新skill_activated或tool_started事件、模型尝试或提取作业。

## 当前验证状态

类型/2文件lint及第四次全新167/TLS实跑均退出0。实际固定API/Worker领取租约并恢复，检查点中一份回执精确回显，原回执和Skill状态不变，启用/tool_started事件0，模型尝试0，最终由正式步数上限保存partial且无提取作业。原有知识来源正常完成/撤回扣留两例也通过。Runtime网络Internal=true已实际核对，临时数据库/网络及服务容器清理。本分支没有另跑后续空Worker。[完整收据](evidence/ma24-g09-committed-receipt-worker-recovery-2026-10-20.json)。

前三次夹具启动失败依次为旧参数白名单拒绝、新内部网络上的宿主数据库连接未就绪、新独立模式未触发完整迁移导致缺agent_run表，均未进入此恢复案例。已接通专用模式、数据库双网络连接和167迁移条件；这些失败作为收据历史保留，未修改生产图或放宽TLS/网络边界。

当前固定应用源码为c47e9f7c，实际测量包登记/签名五类已独立通过。此案例的初始回执和检查点由夹具构造，不执行先前的真实启用，也不证明真实启用后SIGKILL/COMMIT未知结果/租约到期的同一链路恢复。G09完整执行等价、真实质量及最终启用仍待办。
