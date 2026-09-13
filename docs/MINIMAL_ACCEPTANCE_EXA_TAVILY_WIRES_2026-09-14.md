# 阶段114：条件 Exa 与两类 Tavily 补证请求预检

继续扩展只读 `scripts/preview-minimal-production-acceptance.ts`。使用生产 Exa 与 Tavily 提供方，临时合成密钥和立即拒绝的进程内传输分别捕获：当前最小 Colombia/Distributor 路径的条件 Exa 公司搜索、发现后的 Tavily 官方站补证、主角色校正时的 Tavily 缺口补证。每个请求在真实 HTTP 之前停止；原环境密钥在结束时恢复，预算占用前后只读核对，原查询和凭据不写文件。

| 合成请求 | 传输与当前严格合同 | 状态边界 |
|---|---|---|
| Exa 条件发现 | POST `/search`，160字节；`type=auto`、`category=company`、`contents.text=true`、最多2结果；静态USD0.027/次 | 只有前批产生有依据缺口才可能调用；未验证实际市场查询或返回 |
| Tavily 官方补证 | POST `/search`，292字节；basic、最多6结果、无答案/原文/自动参数；静态USD0.016/次 | 合成公司域名；未验证真实官方站或证据有效性 |
| Tavily 校正补证 | POST `/search`，259字节；basic、最多5结果、无答案/原文/自动参数；静态USD0.016/次 | 仅缺证时调用；不将搜索输出当成主角色或合格结论 |

三条请求均由现行 `quoteRequest` 与 `assertRequestContract` 判定 `contract-valid-synthetic-wire`；已验证的是当前提供方的合成请求形态，非真实执行器查询、收费账单或模型输出。SearchAPI、Gemini、Terra、Sol裁决及现行Sol市场计划余额缺口不变；`actualRequestContractsChecked=false`、整次保守上界未知，A11不获放行。当前只读预算仍为USD12.324404/30、余额USD17.675596，历史未知账单保留。

验证：只读预检、相关提供方/费用合同定向测试、typecheck及脚本lint通过；合成输入3次、捕获请求3、合同有效3、内部预检使用3，合成传输总711字节。真实业务候选、有效线索、下游业务使用与用户采用0；真实HTTP、搜索API credits、模型token、现金及付费重试0，供应商延迟未知。优化机会是逐项用实际执行器查询/公司证据重验，并保留失败后对已有证据与费用的安全复用。
