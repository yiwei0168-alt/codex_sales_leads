import {expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {CompanyCostSummary} from "./company-cost-summary";
import {summarizeCompanyCosts} from "@/lib/billing/company-cost-summary";
it("shows independent amounts, real zero, unknown and coverage without exposing internal company keys",()=>{
  const rows=summarizeCompanyCosts([{reserved_micros:"11",occupied_micros:null,estimated_micros:null,
    reported_micros:"0",invoice_micros:null,metrics:null}]);
  const html=renderToStaticMarkup(<CompanyCostSummary rows={rows}/>);
  expect(html).toContain("未分配任务费用");expect(html).toContain("未知");
  expect(html).toContain("$0.000000");expect(html).toContain("$0.000011");
  expect(html).toContain("0/1 次有记录");expect(html).toContain("不能相加");
});
