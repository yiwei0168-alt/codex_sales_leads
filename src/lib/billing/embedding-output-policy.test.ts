import {expect,it} from "vitest";
import {embeddingOutputCompletion} from "./embedding-output-policy";
const request={input:["a","b"],dimensions:2,encoding_format:"float"};
it("accepts exactly one finite correctly-sized vector per input even out of order",()=>{
  expect(embeddingOutputCompletion("rag-embedding",{data:[{index:1,embedding:[0,1]},{index:0,embedding:[1,0]}]},request)).toBe("complete");
  expect(embeddingOutputCompletion("other",{},request)).toBeUndefined();
});
it("rejects missing, duplicate, extra, wrong-sized, nonnumeric and nonfinite vectors",()=>{
  for(const data of [[],[{index:0,embedding:[1,0]}],[{index:0,embedding:[1,0]},{index:0,embedding:[0,1]}],[{index:0,embedding:[1]},{index:1,embedding:[0,1]}],[{index:0,embedding:[1,0]},{index:2,embedding:[0,1]}],[{index:0,embedding:[1,0]},{index:1,embedding:[0,NaN]}],[{index:0,embedding:[1,0]},{index:1,embedding:[0,"1"]}]])expect(embeddingOutputCompletion("rag-embedding",{data},request)).toBe("incomplete");
});
