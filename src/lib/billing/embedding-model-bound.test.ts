import {expect,it,vi} from "vitest";
import {embeddingModelBound,isBeijingEmbeddingOrigin} from "./embedding-model-bound";
import {assertRequestContract} from "./request-contract";
const now=Date.parse("2026-09-13T01:00:00Z");
const fx={usdNumerator:"1159200",nativeDenominator:"7776200",asOf:"2026-09-11T00:00:00Z",retrievedAt:"2026-09-13T00:00:00Z",reference:"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",version:"ecb-cny-usd-2026-09-11"};
const input={origin:"https://test-workspace.cn-beijing.maas.aliyuncs.com",pathname:"/compatible-mode/v1/embeddings",model:"text-embedding-v4",requestBytes:1000,outputTokens:null};
it("bounds the full accepted batch using Beijing price and buffered FX",async()=>{
  const result=await embeddingModelBound(input,now,async()=>fx);
  expect(result?.rule.foreignCostBound?.maximumNativeMicros).toBe(40960);
  expect(result?.rule.maximumChargeMicros).toBe(6412);
  expect(result?.version).toBe("aliyun-embedding-bounds-v1.0.0");
  const body={model:input.model,input:["synthetic"],dimensions:1536,encoding_format:"float"};
  expect(()=>assertRequestContract(result!.rule,body,"")).not.toThrow();
  for(const patch of [{input:Array(11).fill("text")},{input:[]},{input:[[12,23]]},{input:{file:"https://example.test"}},{dimensions:3072},{encoding_format:"base64"},{output_type:"sparse"},{max_tokens:1}])expect(()=>assertRequestContract(result!.rule,{...body,...patch},"")).toThrow();
});
it("rejects other regions, misleading hosts, paths and models without FX lookup",async()=>{
  const read=vi.fn();
  for(const origin of ["https://evil.cn-beijing.maas.aliyuncs.com.example.com","https://test.ap-southeast-1.maas.aliyuncs.com","http://test.cn-beijing.maas.aliyuncs.com","https://test.cn-beijing.maas.aliyuncs.com:443/path"]){
    expect(isBeijingEmbeddingOrigin(origin)).toBe(false);expect(await embeddingModelBound({...input,origin},now,read)).toBeNull();
  }
  expect(await embeddingModelBound({...input,model:"text-embedding-v3"},now,read)).toBeNull();expect(read).not.toHaveBeenCalled();
});
it("fails closed for expired references, missing FX and oversized requests",async()=>{
  await expect(embeddingModelBound(input,now,async()=>null)).rejects.toThrow("expired-tariff");
  await expect(embeddingModelBound(input,Date.parse("2026-09-18T00:00:00Z"),async()=>fx)).resolves.not.toBeNull();
  await expect(embeddingModelBound(input,Date.parse("2026-09-20T00:00:00Z"),async()=>fx)).rejects.toThrow("expired-tariff");
  await expect(embeddingModelBound({...input,requestBytes:1048577},now,async()=>fx)).rejects.toThrow("request-out-of-bounds");
});
