import {expect,it,vi} from "vitest";
import type {PoolClient} from "pg";
import {recordRelationshipAdoption} from "./relationship-adoption";
const selection={analysisId:"analysis",suggestionIndex:1};
it("counts an original suggestion index once across repeated saves",async()=>{
  const query=vi.fn().mockResolvedValueOnce({rows:[{result:{suggestions:[{},{}]},metrics:{usedSuggestionIndices:[1]}}]}).mockResolvedValue({rows:[]});
  await recordRelationshipAdoption({query} as unknown as PoolClient,"owner","workspace","CO","from","to",selection,"pending");
  expect(query.mock.calls[0][1]).toEqual(["analysis","owner","workspace","CO","from","to"]);
  expect(JSON.parse(query.mock.calls[1][1][2])).toMatchObject({downstreamUsedItems:1,usedSuggestionIndices:[1],downstreamUtilizationEfficiency:0.5});
});
it("rejects missing/cross-owner/pair-mismatched analysis without recording adoption",async()=>{
  const query=vi.fn().mockResolvedValue({rows:[]});
  await expect(recordRelationshipAdoption({query} as unknown as PoolClient,"owner","workspace","CO","from","to",selection,"pending")).rejects.toThrow();
  expect(query).toHaveBeenCalledTimes(1);
});
