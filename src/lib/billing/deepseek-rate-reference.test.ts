import {expect,it,vi} from "vitest";
import {fetchDeepSeekRateEvidence,parseDeepSeekPublicRates} from "./deepseek-rate-reference";

const table=`<table><tr><td>MODEL</td><td>deepseek-flash<sup>(1)</sup></td><td>deepseek-v4-pro<sup>(2)</sup></td></tr>
<tr><td>MODEL VERSION</td><td>DeepSeek-V4.1-Flash</td><td>DeepSeek-V4-Pro-0813</td></tr>
<tr><td>CONTEXT LENGTH</td><td>1M</td></tr><tr><td>MAX OUTPUT</td><td>MAXIMUM: 384K</td></tr>
<tr><td>PRICING</td><td>1M INPUT TOKENS<br>(CACHE HIT)</td><td>OFF-PEAK</td><td>$0.003</td><td>$0.022</td></tr>
<tr><td>PEAK</td><td>$0.006</td><td>$0.044</td></tr>
<tr><td>1M INPUT TOKENS<br>(CACHE MISS)</td><td>OFF-PEAK</td><td>$0.15</td><td>$0.66</td></tr>
<tr><td>PEAK</td><td>$0.3</td><td>$1.32</td></tr>
<tr><td>1M OUTPUT TOKENS</td><td>OFF-PEAK</td><td>$0.6</td><td>$1.98</td></tr>
<tr><td>PEAK</td><td>$1.2</td><td>$3.96</td></tr></table>`;
function transport(html=table){return vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(String(input)!=="https://api-docs.deepseek.com/quick_start/pricing/"||init?.method!=="GET")
    throw new Error("Unexpected public source request");
  return new Response(html,{headers:{"content-type":"text/html; charset=utf-8"}});
});}

it("parses the exact official two-model peak and off-peak table",async()=>{
  expect(parseDeepSeekPublicRates(table).models.map(item=>[item.id,item.cacheMiss.peak,item.output.peak]))
    .toEqual([["deepseek-flash",0.3,1.2],["deepseek-v4-pro",1.32,3.96]]);
  const get=transport();
  const result=await fetchDeepSeekRateEvidence(get as typeof fetch);
  expect(get).toHaveBeenCalledTimes(1);
  expect(get.mock.calls[0][0]).toBe("https://api-docs.deepseek.com/quick_start/pricing/");
  expect(result.items.map(item=>item.status)).toEqual(["validated","validated"]);
  expect(result.items.map(item=>item.evidence.audit.currentMaximumMicros)).toEqual([324404,1416561]);
  expect(result).toMatchObject({paidCalls:0,tariffAdmitted:false});
});
it("holds only the changed model when a valid peak price drifts",async()=>{
  const result=await fetchDeepSeekRateEvidence(transport(table.replace("<td>$0.3</td>","<td>$0.31</td>")) as typeof fetch);
  expect(result.items.map(item=>item.status)).toEqual(["review-required","validated"]);
  expect(result.items[0].evidence.audit.currentMaximumMicros).toBeGreaterThan(324404);
  expect(result.items[0].evidence.audit.tariffAdmitted).toBe(false);
});
it.each(["version","price","table"])("holds both rules for ambiguous %s evidence",async change=>{
  const html=change==="version"?table.replace("DeepSeek-V4.1-Flash","Unknown Flash")
    :change==="price"?table.replace("<td>$1.32</td>","<td>unknown</td>")
      :table.replace("</table>","");
  const result=await fetchDeepSeekRateEvidence(transport(html) as typeof fetch);
  expect(result.items.some(item=>item.status==="review-required")).toBe(true);
  expect(result.tariffAdmitted).toBe(false);
});
it("keeps transient server errors unavailable without accepting unchanged rates",async()=>{
  const get=vi.fn(async()=>new Response(table,{status:503,headers:{"content-type":"text/html"}}));
  await expect(fetchDeepSeekRateEvidence(get as typeof fetch)).rejects.toThrow("unavailable");
  await expect(fetchDeepSeekRateEvidence(vi.fn(async()=>new Response("rate limited",{status:429})) as typeof fetch)).rejects.toThrow("unavailable");
});
it.each(["non-HTML success","partial page","moved page","missing page","oversized page"])("marks %s public evidence review-required",async variant=>{
  const status=variant==="partial page"?206:variant==="moved page"?302:variant==="missing page"?404:200;
  const contentType=["partial page","oversized page"].includes(variant)?"text/html":"text/plain";
  const get=vi.fn(async()=>new Response(variant==="oversized page"?table.padEnd(1_000_001,"x"):table,
    {status,headers:{"content-type":contentType}}));
  const result=await fetchDeepSeekRateEvidence(get as typeof fetch);
  expect(result.items.map(item=>item.status)).toEqual(["review-required","review-required"]);
  expect(result.tariffAdmitted).toBe(false);
});
