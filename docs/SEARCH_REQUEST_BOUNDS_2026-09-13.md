# 普通搜索费用上界核验

阶段39增量：request-bounds-v1.4.0新增Google Places POST https://places.googleapis.com/v1/places:searchText，单页1–20结果、包络16384字节，上界USD0.035/次，有效至2026-09-20T00:00:00Z。[官方价格表](https://developers.google.com/maps/billing-and-pricing/pricing)列出Text Search Enterprise SKU E967-44BC-B44D为USD35/1000次；[字段说明](https://developers.google.com/maps/documentation/places/web-service/text-search)将websiteUri归入Enterprise；[计费说明](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)明确按选中字段最高SKU计费。不扣免费额度或批量折扣。

发送前检查实际X-Goog-FieldMask，只允许当前7字段的非空无重复子集：id、displayName、formattedAddress、websiteUri、googleMapsUri、businessStatus、primaryTypeDisplayName（均places.前缀）。通配符、评论、生成摘要、其他字段/分页/路由参数均阻止。仅将Headers传入内存校验，不写密钥到费用记录。800测试/174文件、typecheck/build通过，包含非法头在预留/发送前拦截的传输测试；真实服务调用0。此为上界验证，SearchAPI/Gemini/OpenRouter及真实账单/业务验收仍待完成。

阶段38增量：当前规则request-bounds-v1.3.0新增Exa POST https://api.exa.ai/search，固定auto/company、text=true、最多20结果；保守上界USD0.027：基础USD0.007，加最多10条额外结果USD0.010，再保守覆盖10个额外文本页USD0.010。依据[官方价格表](https://exa.ai/pricing)及[内容费用说明](https://exa.ai/docs/reference/contents-api-guide)。请求包络16384字节，有效期仍至2026-09-20T00:00:00Z，无免费额度或企业折扣假设。

[官方Search契约](https://exa.ai/docs/reference/search)说明company类别不支持excludeDomains；生产适配器移除此字段，原查询不改，本地registry及initiallyExcludedDomains仍排除重复公司。拒绝deep、summary、subpages、outputSchema和其他额外能力。请求/会话契约升级discovery-request-v3-exa-company-contract，旧会话依赖不匹配时阻止静默恢复，既有费用不释放。官方costDollars明确为估算，不能用于可信账单核销。798测试/174文件、typecheck/build通过，无新产品调用；SearchAPI、Places、Gemini、OpenRouter上界继续待补齐。

阶段37，核验日期2026-09-13，规则版本request-bounds-v1.2.0；有效至2026-09-20T00:00:00Z。仅核验公开标准计费，企业自定义合同不在适用范围，不使用免费额度或套餐折扣降低预留。

| 服务 | 官方依据 | 获准请求 | 保守预留 |
|---|---|---|---:|
| Brave | [官方Search定价](https://brave.com/search/api/)：USD5/1000 requests；[GET Web Search契约](https://api-dashboard.search.brave.com/api-reference/web/search/get) | GET https://api.search.brave.com/res/v1/web/search，仅q/country/search_lang/count，count 1–20，禁止重复参数、请求体及其他功能 | USD0.005/次 |
| Tavily | [官方额度定价](https://docs.tavily.com/documentation/api-credits)：PAYG USD0.008/credit，basic 1、advanced 2 credits；[Search契约](https://docs.tavily.com/documentation/api-reference/endpoint/search) | POST https://api.tavily.com/search，显式basic/advanced，max_results 1–20，include_answer=false，自动参数禁用；raw content仅false/markdown | USD0.016/次，basic也保守预留2 credits |

两入口完整请求包络均16384字节，模型字段为空、输出token上限不适用。规则严格检查方法、端点和白名单字段；Answers/Research/Crawl/Extract、未知字段、错误方法、重复参数及过期规则均不放行。Tavily生产请求显式auto_parameters=false，避免依赖自动升级深度。

这里的金额只用于预留，不是服务商报告、核验账单或新增支出。没有可信报告时保持未知和原预留，不以固定单价推定真实费用。已有DeepSeek两条规则完整保留；OpenRouter、Exa、SearchAPI、Places及Gemini等尚缺的上界没有借此开放。

验证：796测试/174文件、typecheck与生产build通过。新增测试覆盖两种合法请求、超额参数、未知能力、方法、重复query和到期阻止；属于契约/合成传输回归，尚不替代真实业务及真实账单验收。

本阶段只读重新核验验收预算：上限USD30，累计占用USD12.324404，余额USD17.675596，未知历史账单6笔，在途0。新产品搜索、模型及其他付费调用0。下一真实调用前仍需重新核对预算及完整保守预留。
