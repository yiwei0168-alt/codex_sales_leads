# G09 实际测量运行包登记联合验收准备

第四次终态：04433870固定夹具、c47e9f7c实际双镜像、全新167隔离数据库退出0。实际测量登记由真实读者回读，runtimePackagesRegistered=true、collectorProvenanceVerified=true；五类签名、2原任务/8评测臂、材料/原件撤销恢复、登记禁用等待及分用途停用拒绝通过。readiness仍未封闭，缺人工判定仍阻断，Skill未启用。前三次失败保留；下文“联合未通过/待重跑”由此取代。[完整终态](evidence/ma24-g09-measured-registration-composition-2026-10-20.json)。

这是实际测量包与真实SQL/签名读者的工程组合正例，模型/网络/预算仍合成，签名键临时且仅在一次性库登记，不证明真实提供方、生产身份、执行等价性或独立质量。镜像/app不被修改，较新夹具的运行源码/配置逐字节等于固定镜像；本组数据库回环分支非TLS，另有同固定包166/TLS声明收据，不能混称同一链路。

第三次终态：c47e9f7c同修订新固定双包/夹具在166退出1；完整五类、初次readiness及collectorProvenanceVerified=true断言已执行通过，随后停用采集器键的负例期待旧Task failure trust unavailable，实际为Transport trust key unavailable。用途分离后原任务键仍有效，产品按正确的模型传输用途拒绝；现测量模式严格期待后者，旧未登记模式仍期待前者，没有放宽为任意错误。完整联合尚未判通过，修复后需新固定夹具归档重跑；应用源码与c47e9f7c镜像相同，可经字节比对复用，不重建无变化应用。[第三次失败](evidence/ma24-g09-measured-registration-third-attempt-2026-10-20.json)。

第二次终态：固定6737b211夹具重跑退出1，已通过首次登记，配置候选子进程在复核原任务失败回执时报告Task failure binding changed。原因是夹具分离主任务/采集器部署后，仍把采集器身份写到TASK_MODEL_TRANSPORT_*；现测量模式保留原主任务环境身份，SKILL_*继续使用独立采集器身份，默认旧夹具路径保持。完整联合仍未通过；下一次需与新产品源码一致的固定包，不能复用源码已不同的旧镜像。[第二次失败](evidence/ma24-g09-measured-registration-second-attempt-2026-10-20.json)。

首跑终态：8a8acb17夹具在37a2ef90固定镜像中退出1，正式登记SQL拒绝“Runtime package revision changed”。原因是首次登记传入预期修订0，正式函数的无旧版本契约为NULL；现仅将夹具改为NULL，未放宽正式校验。入口新增显式MA24_MEASURED_FIXTURE_COMMIT，避免初始化期间HEAD变化影响验收版本；语法、类型和2文件lint通过。失败收据保留，修复后完整重跑待启动/终态。[失败及修复](evidence/ma24-g09-measured-registration-first-attempt-2026-10-20.json)。

对应MA24-06，无新增确认。已有固定37a2ef90 Linux五类验证通过，但运行包登记缺失；真实readiness仍返回collectorProvenanceVerified=false。本阶段为隔离工程夹具接入实际测量包登记正例，不改变产品资格、人工质量或启用规则。

## 实施

- Linux验收入口可通过MA24_MEASURED_MAIN_IMAGE指定同修订固定主运行包。每次从不可变镜像ID重新测量两包完整清单、依赖字节与ESM格式，使用只读测量文件传入容器；不使用手填部署哈希。
- 允许测试夹具修订晚于镜像修订，但运行前必须将归档的全部运行源码/配置文件列表与每一文件字节对照镜像/app/.skill-runtime-source。任何实际产品源码或配置变化均拒绝复用旧镜像。报告分别保留镜像修订和夹具修订，不把两者混称同一提交。
- 夹具为主任务传输与采集器生成不同临时签名键，各绑定对应实际部署测量。主包登记task-model-transport，采集器登记model-transport及runner-declaration；通过正式登记SQL写入一次性库，先于其模型尝试。
- 完整readiness仍使用真实登记/签名/材料读者。测量模式要求runtimePackagesRegistered=true及collectorProvenanceVerified=true，同时必须保持缺人工判定导致policyPassed=false、sourceRevocationsLocked=false和automaticActivation=false。默认未登记模式仍要求登记缺失阻断。

## 当前证据与边界

脚本语法、全项目类型检查和4文件lint通过；完整登记联合实跑须在本阶段提交后从固定夹具修订执行，尚未判通过。初次类型检查发现联合返回值需显式收窄，以及当前TS目标不支持BigInt字面量；已保留严格条件并修复。[准备收据](evidence/ma24-g09-measured-registration-preparation-2026-10-20.json)。

该模式使用真实镜像测量与真实数据库登记，但网络/模型结果及签名身份仍为临时合成工程数据，无human质量判定和生产注册。即使来源组合组件通过，也不证明提供方真实性、完整执行等价、整组生产入口包装器/TLS或真实正向启用。G09与全goal均未完成。
