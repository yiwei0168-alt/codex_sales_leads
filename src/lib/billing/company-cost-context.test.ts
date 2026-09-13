import {expect,it} from "vitest";
import {companyCostKey,costRoundKey,withCompanyCostAttribution} from "./company-cost-context";
import {currentSpendContext,withProductSpend,withSpendContext} from "./context";
const root={userId:"owner",operationId:"action",stage:"score",costAttribution:{version:"company-cost-attribution-v1" as const,kind:"unclassified" as const,companyKeys:[],roundKey:costRoundKey("round-one")}};
it("keys public company identity by market without recording raw domain or personal data",()=>{
  expect(companyCostKey("WWW.Example.com.","GB")).toBe(companyCostKey("example.com","GB"));
  expect(companyCostKey("example.com","GB")).not.toBe(companyCostKey("example.com","MX"));
  expect(companyCostKey("example.com","GB")).toMatch(/^[a-f0-9]{64}$/);
  for(const domain of ["user:secret@example.com","example.com/path","example.com?key=secret","example.com:80"])
    expect(()=>companyCostKey(domain,"GB")).toThrow();
});
it("isolates concurrent batches and narrows a retry/repair to its actual single input",async()=>{
  await withSpendContext(root,async()=>{
    await Promise.all(["a.example","b.example"].map(domain=>withCompanyCostAttribution([{domain},{domain}],"GB",async()=>{
      await Promise.resolve();expect(currentSpendContext()?.costAttribution?.companyKeys).toEqual([companyCostKey(domain,"GB")]);
      withCompanyCostAttribution([{domain:"repair.example"}],"GB",()=>expect(currentSpendContext()?.costAttribution?.companyKeys).toEqual([companyCostKey("repair.example","GB")]));
      expect(currentSpendContext()?.costAttribution?.companyKeys).toEqual([companyCostKey(domain,"GB")]);
    })));
    expect(currentSpendContext()).toBe(root);
  });
  expect(currentSpendContext()).toBeUndefined();
});
it("inherits same-operation attribution but never silently transfers it to a new task",()=>{
  withSpendContext(root,()=>{
    withProductSpend("owner","child",()=>expect(currentSpendContext()?.costAttribution).toBe(root.costAttribution));
    withProductSpend("owner","child",()=>expect(currentSpendContext()?.costAttribution).toBeUndefined(),"other-action");
  });
  expect(costRoundKey("round-one")).not.toBe(costRoundKey("round-two"));
});
it("does not change separately accounted experiments without a product spend context",()=>{
  expect(withCompanyCostAttribution([],"",()=>"unchanged")).toBe("unchanged");
  withSpendContext(root,()=>expect(()=>withCompanyCostAttribution([],"GB",()=>"unreachable")).toThrow());
});
