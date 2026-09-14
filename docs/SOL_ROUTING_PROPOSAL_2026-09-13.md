# S01：市场计划 Sol 的 OpenAI 标准路由方案（已确认并实施）

2026-09-14 用户多次批准同一项 S01，按本报告限定的市场计划范围实施。当前产品合同为 `request-bounds-v1.7.0` 的 `openrouter-sol-openai-playbook-credits`，实际 LangChain 合成传输和费用拒绝路径见 [无付费验收](S01_SOL_PLAYBOOK_ROUTING_ACCEPTANCE_2026-09-14.md)。原 v1.6.0 多供应商合同保留给非市场计划用途；以下提案时文字保留历史决策脉络。真实付费仍须累计 USD30 与整次预检。

阶段72补到新证据：[OpenAI缓存文档](https://developers.openai.com/api/docs/guides/prompt-caching)明确缓存写入不是额外叠加费用，输入分普通、缓存读、缓存写三类费率。[Sol模型页](https://developers.openai.com/api/docs/models/gpt-5.6-sol)确认长上下文价格倍率。此证据尚不单独证明Azure/Bedrock经网关计费的全部细节，不直接将现行多供应商上界改为互斥计算。

具体建议只作用于市场计划buildLeadMarketPlaybook：继续使用openai/gpt-5.6-sol及OpenRouter credits，provider保留require_parameters=true/data_collection=deny，新增only=['openai']、allow_fallbacks=false。不请求特殊服务层、工具、插件或显式缓存；维持61440请求字节、4096总输出token及strict JSON Schema。其他模型和阶段不变。

[OpenRouter路由文档](https://openrouter.ai/docs/guides/routing/provider-selection)支持only和禁用fallback，但only会减少可恢复的供应商范围；基础slug可能包含变体，所以继续依赖当前“不请求特殊服务层”的严格契约。OpenAI标准端点不可用时暂停，不自动切换Azure/Bedrock，不换模型或降低评分标准。[OpenRouter缓存文档](https://openrouter.ai/docs/guides/best-practices/prompt-caching)确认GPT-5.6缓存写入倍率并链接上游说明；使用网关端点价格而非OpenAI直连价格。

公开GET实抓[证据JSON](SOL_OPENAI_ONLY_PROPOSAL_2026-09-13.json)，精确endpoint tag=openai，长上下文覆盖价及去折扣最大单价每百万：普通输入8、缓存读0.8、缓存写10、输出30美元。全1050000上下文按最贵输入类10/M，输出4096×30/M，合计 **USD10.622880**。未用max_prompt_tokens进一步压缩，未假定缓存命中。`preview-sol-openai-only-bound.ts --write`复算通过且拒绝变化后的价格，不是自动准入器。

当前生效仍是v1.6.0多供应商USD27.345252，未修改配置。只读预检重新确认累计USD30、占用12.324404、余17.675596；无推理、账号修改或job认领。即使S01采纳，也须完成实际SDK新契约验证、模型/搜索/复核/备用全部入口和整次运行预算预检，不能直接启动真实闭环；Gemini硬查询上界等仍是独立缺口。

采纳状态：**待用户确认**。依据既有A11“涨价、计费合同变化、模型路由变化需用户确认”，S01改变供应商路由，不能用O01–O05授权代替确认。接受后实施新版本并保留原规则/费用历史；拒绝则保留现行路由，继续核对各供应商计费证据。无新规则已确认的结论。

2026-09-14补充：[条件复核预算情景](OPENROUTER_REVIEW_BUDGET_SCENARIO_2026-09-14.md)显示，S01单次上界与Terra复核情景上界合计USD21.642082，高于上次核验的剩余USD17.675596；复核是否触发和实际核销金额未知。S01仍待确认，不能仅凭市场计划单次可容纳启动或宣称整次闭环可完成。
