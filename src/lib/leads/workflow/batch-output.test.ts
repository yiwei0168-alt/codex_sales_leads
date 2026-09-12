import {expect,it} from "vitest";
import {z} from "zod";
import {validateBatchItems} from "./batch-output";
const schema=z.object({candidateId:z.string(),score:z.number()});
it("preserves a valid peer when another item is malformed",()=>{
  expect(validateBatchItems({items:[{candidateId:"a",score:80},{candidateId:"b",score:"bad"}]},"items",schema,["a","b"]))
    .toEqual({items:[{candidateId:"a",score:80}],complete:false,rejectedItems:1,missingItems:1});
});
it("rejects all duplicates even when one duplicate is malformed and excludes foreign IDs",()=>{
  const result=validateBatchItems({items:[{candidateId:"a",score:80},{candidateId:"a",score:null},{candidateId:"b",score:70},{candidateId:"foreign",score:90}]},"items",schema,["a","b"]);
  expect(result.items).toEqual([{candidateId:"b",score:70}]);expect(result.complete).toBe(false);
});
it("requires a proper envelope and unique expected IDs",()=>{
  expect(()=>validateBatchItems({items:"broken"},"items",schema,["a"])).toThrow(z.ZodError);
  expect(()=>validateBatchItems({items:[]},"items",schema,["a","a"])).toThrow("Duplicate input");
  expect(validateBatchItems({items:[{candidateId:"a",score:80}]},"items",schema,["a"]).complete).toBe(true);
});
