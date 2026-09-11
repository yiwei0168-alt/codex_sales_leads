import {expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {TaskRecordSummary} from "./task-record-summary";
it("renders candidates and preserves unknown cost rather than converting it to zero",()=>{
  const html=renderToStaticMarkup(<TaskRecordSummary details={{metrics:{costUsd:null,inputTokens:20},candidates:[{company:"Company A",role:"SI",score:85,eligible:true,selected:true,reasons:["Network projects"]}]}}/>);
  expect(html).toContain("Company A");expect(html).toContain("Network projects");expect(html).toContain("未记录");expect(html).not.toContain("[object Object]");
});
