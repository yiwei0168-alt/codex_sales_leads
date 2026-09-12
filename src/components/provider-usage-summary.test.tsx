import {expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {ProviderUsageSummary} from "./provider-usage-summary";

it("shows partial coverage and reported zero without claiming invoice savings or full totals",()=>{
  const html=renderToStaticMarkup(<ProviderUsageSummary groups={[{stage:"score",provider:"deepseek",requestedModel:"requested",reportedModel:null,promptVersion:"v1",gatewayHost:null,endpointKind:"messages",attempts:3,fields:[{field:"cache_read_input_tokens",reportedAttempts:2,total:"0"},{field:"output_tokens",reportedAttempts:0,total:null}]}]}/>);
  expect(html).toContain("cache_read_input_tokens");
  expect(html).toContain("2/3");
  expect(html).toContain("已报告 0 tokens");
  expect(html).toContain("响应模型：未报告");
  expect(html).toContain("缓存数量不等于实际节省费用");
  expect(html).not.toContain("output_tokens：");
});
it("missing observations render unknown, not zero",()=>{
  const html=renderToStaticMarkup(<ProviderUsageSummary groups={undefined}/>);
  expect(html).toContain("不能推断用量或费用为零");
  expect(html).not.toContain("0 tokens");
});
