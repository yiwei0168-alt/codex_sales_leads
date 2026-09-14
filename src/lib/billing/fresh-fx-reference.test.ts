import { expect,it,vi } from "vitest";
import { readFreshCnyFxReference } from "./fresh-fx-reference";
import {withSpendContext} from "./context";

it.each(["validated","cached-refresh-state","refresh-in-progress"])("reads independently validated cache after %s refresh",async status=>{
  const events:string[]=[];
  const reference={usdNumerator:"1",nativeDenominator:"7",asOf:"2026-09-11T00:00:00Z",retrievedAt:"2026-09-11T01:00:00Z",reference:"https://www.ecb.europa.eu",version:"fixture"};
  const result=await readFreshCnyFxReference(0,{
    refresh:async()=>{events.push("refresh");return {status,httpCalls:0};},
    read:async()=>{events.push("read");return reference;},
  });
  expect(events).toEqual(["refresh","read"]);expect(result).toBe(reference);
});
it("uses the pinned acceptance snapshot without any refresh attempt",async()=>{
  const refresh=vi.fn();const read=vi.fn().mockResolvedValue({version:"pinned"});
  const result=await withSpendContext({userId:"acceptance",operationId:"fixture",stage:"validation",
    fixedFxReferenceVersion:"pinned"},()=>readFreshCnyFxReference(Date.now(),{refresh,read}));
  expect(result).toEqual({version:"pinned"});
  expect(refresh).not.toHaveBeenCalled();expect(read).toHaveBeenCalledOnce();
});
it("preserves the validated cache on refresh failure, and keeps missing or expired cache unavailable",async()=>{
  const cached={usdNumerator:"1",nativeDenominator:"7",asOf:"2026-09-11T00:00:00Z",retrievedAt:"2026-09-11T01:00:00Z",reference:"https://www.ecb.europa.eu",version:"fixture"};
  expect(await readFreshCnyFxReference(0,{refresh:async()=>{throw new Error("outage");},read:async()=>cached})).toBe(cached);
  const read=vi.fn().mockResolvedValue(null);
  expect(await readFreshCnyFxReference(0,{refresh:async()=>{throw new Error("refresh unavailable");},read})).toBeNull();
  expect(read).toHaveBeenCalledTimes(1);
  await expect(readFreshCnyFxReference(0,{refresh:async()=>({status:"unavailable",httpCalls:1}),read:async()=>{throw new Error("snapshot unavailable");}})).rejects.toThrow("snapshot unavailable");
});
