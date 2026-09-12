import {expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {CostStageSummary} from "./cost-stage-summary";
it("keeps the four amounts separate and makes partial coverage explicit",()=>{
  const html=renderToStaticMarkup(<CostStageSummary stages={[{stage:"score",calls:2,reserved_micros:"200",occupied_micros:"140",estimated_micros:"20",reported_micros:"0",invoice_micros:null,estimated_calls:1,reported_calls:1,invoice_calls:0,unreconciled_calls:1,unknown_bills:1}]}/>);
  expect(html).toContain("不能相加");expect(html).toContain("$0.000200");expect(html).toContain("$0.000140");
  expect(html).toContain("$0.000000");expect(html).toContain("未知");expect(html).toContain("1/2 次有记录");expect(html).toContain("0/2 次有记录");
});
it("does not label missing history as free usage",()=>{
  expect(renderToStaticMarkup(<CostStageSummary stages={[]}/>)).toContain("不能据此推断历史费用为零");
});
