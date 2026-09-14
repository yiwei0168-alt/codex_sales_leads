import {expect,it,vi} from "vitest";
import {nativeModelBound} from "./native-model-bound";
import {assertRequestContract} from "./request-contract";
const now=Date.parse("2026-09-13T01:00:00Z");
const fx={usdNumerator:"1159200",nativeDenominator:"7776200",asOf:"2026-09-11T00:00:00Z",retrievedAt:"2026-09-13T00:00:00Z",reference:"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",version:"ecb-cny-usd-2026-09-11"};
const input={origin:"https://api.moonshot.cn",pathname:"/v1/chat/completions",model:"kimi-k2.6",requestBytes:1000,outputTokens:4000};
it("uses official context ceiling, current explicit output limit and exact buffered stored FX",async()=>{
  const result=await nativeModelBound(input,now,async()=>fx);
  expect(result?.rule.foreignCostBound?.maximumNativeMicros).toBe(1811936);
  expect(result?.rule.foreignCostBound?.fx).toEqual(fx);
  expect(result?.version).toBe("kimi-text-bounds-v1.0.0");
  const k3=await nativeModelBound({...input,model:"kimi-k3",outputTokens:12000},now,async()=>fx);
  expect(k3?.rule.foreignCostBound?.maximumNativeMicros).toBe(22171520);
  expect(k3!.rule.maximumChargeMicros).toBeGreaterThan(result!.rule.maximumChargeMicros);
});
it("does not open unreviewed gateways, international endpoint, models or paths",async()=>{
  const read=vi.fn();
  for(const patch of [{origin:"https://api.moonshot.ai"},{origin:"https://gateway.example"},{model:"kimi-k2.7-code"},{pathname:"/v1/sessions"}])expect(await nativeModelBound({...input,...patch},now,read)).toBeNull();
  expect(read).not.toHaveBeenCalled();
});
it("blocks expired/missing references, rates, oversized and unbounded requests",async()=>{
  await expect(nativeModelBound(input,now,async()=>null)).rejects.toThrow("expired-tariff");
  await expect(nativeModelBound(input,Date.parse("2026-09-18T00:00:00Z"),async()=>fx)).rejects.toThrow("expired-tariff");
  await expect(nativeModelBound(input,Date.parse("2026-09-20T00:00:00Z"),async()=>fx)).rejects.toThrow("expired-tariff");
  for(const patch of [{outputTokens:null},{outputTokens:12001},{requestBytes:262145}])await expect(nativeModelBound({...input,...patch},now,async()=>fx)).rejects.toThrow("request-out-of-bounds");
});
it("rejects every tool, media, stream, second-choice and unsupported output-limit extension",async()=>{
  const result=await nativeModelBound({...input,model:"kimi-k3"},now,async()=>fx);
  const body={model:"kimi-k3",messages:[{role:"system",content:"JSON instructions"},{role:"user",content:"text"}],max_completion_tokens:4000,response_format:{type:"json_object"}};
  expect(()=>assertRequestContract(result!.rule,body,"")).not.toThrow();
  for(const patch of [{tools:[]},{stream:true},{n:2},{max_tokens:4000},{thinking:{type:"disabled"}},{messages:[{role:"user",content:[{type:"image_url",image_url:"secret"}]}]}])expect(()=>assertRequestContract(result!.rule,{...body,...patch},"")).toThrow();
  expect(()=>assertRequestContract(result!.rule,body,"?alternate=route")).toThrow();
});
