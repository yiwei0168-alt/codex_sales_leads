# A11 首轮搜索请求量预检对齐（阶段171）

隔离目标 1 家哥伦比亚 Distributor 的只读预检以前直接向 Brave/Exa 合成提供方传 `maxResults=2`。真实发现执行器先按目标算首轮池 2，再用策略的 `defaultBatchSize=12` 与 `maxBatchSize=20` 决定每条路线请求量，因此实际向这两个提供方传 12。阶段171将该确定性函数放到搜索策略模块，由执行器和只读预检共同调用；执行器的原公式与运行行为不变，预检不再用目标池数量冒充实际请求量。

`node scripts/run-tsx.cjs scripts/preview-minimal-production-acceptance.ts` 本地拦截合成传输：`firstRoundPoolForOneTarget=2`、`firstRoundRequestedResults=12`，Brave `count=12`、条件 Exa `numResults=12` 的完整实际序列化请求都通过现有单次严格合同。该方案路线有4个步骤、图最多5轮；单路线是否真正触发、提供方重试、每轮候选/补证/分阶段评分及复核次数仍取决于运行时结果。SearchAPI/Gemini未因本次获得费用合同，真实市场查询与响应均未验证；`totalRunBoundUsd`仍为`null`，不能据这两个成功合成请求启动付费任务。

验证：定向搜索策略/执行器28项通过，全量1015项/207文件、TypeScript、Next.js生产构建、修改文件lint和生产依赖审计0漏洞。真实供应商搜索、模型、SMTP、token/API credits、现金与付费重试均0；只读预检约8秒，供应商真实延迟未知。输入1个合成计划、4条路线定义，有效捕获Brave/Exa请求2、用于费用合同核对2，真实线索/用户采用未知；业务输出利用率未测。优化机会是让其余合成入口复用执行器的真实请求契约并收敛整次调用数上界，不把合成传输成功当成真实填充率或账单证据。
