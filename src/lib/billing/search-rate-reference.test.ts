import {expect,it,vi} from "vitest";
import {SEARCH_RATE_SOURCES,fetchSearchRateEvidence,parseBraveSearchRate,parseTavilySearchRate} from "./search-rate-reference";

const braveHtml=`<html><script type="application/ld+json">${JSON.stringify([{
  name:"Brave Search API",url:"https://brave.com/search/api/",offers:[
    {name:"Free Credits",priceCurrency:"USD",description:"Free"},
    {name:"Search Plan",priceCurrency:"USD",description:"$5 per 1,000 requests. Up to 50 queries per second."},
    {name:"Answers Plan",priceCurrency:"USD",description:"$4 per 1,000 requests + tokens"}]}])}</script>
    <section id="plans"><h3>Search</h3><p><span>$5</span> per 1,000 requests</p>
    <h3>Answers</h3><p>$4 per 1,000 requests plus tokens</p></section></html>`;
const tavilyMarkdown=`## Pricing Overview
* **Pay-as-you-go**: \\$0.008 per credit
| **Pay as you go** | Per usage | \\$0.008 / Credit | \\$0.008 |
## API Credits Costs
### Tavily Search
* **Basic Search (\`basic\`):**
  Each request costs **1 API credit**.
* **Advanced Search (\`advanced\`):**
  Each request costs **2 API credits**.
### Tavily Extract
* **Advanced Extract (\`advanced\`):**
  Every 5 successful URL extractions cost **2 API credits**
`;
function transport(body:string,type:string,status=200){return vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(!String(input).startsWith("https://")||init?.method!=="GET")throw new Error("Unexpected public source request");
  return new Response(body,{status,headers:{"content-type":type}});
});}

it("extracts the Search offer without accepting Brave Answers or free credits",async()=>{
  expect(parseBraveSearchRate(braveHtml)).toEqual({plan:"Search Plan",currency:"USD",usdPer1000Requests:5});
  const get=transport(braveHtml,"text/html");
  const result=await fetchSearchRateEvidence(SEARCH_RATE_SOURCES[0],get as typeof fetch);
  expect(result.status).toBe("validated");expect(get).toHaveBeenCalledOnce();
  expect(get.mock.calls[0][0]).toBe("https://brave.com/search/api/");
  expect(result).toMatchObject({paidCalls:0,tariffAdmitted:false});
});
it("extracts Tavily pay-as-you-go and both Search depths only",async()=>{
  expect(parseTavilySearchRate(tavilyMarkdown)).toEqual({usdPerCredit:0.008,basicCredits:1,advancedCredits:2});
  const get=transport(tavilyMarkdown,"text/markdown");
  const result=await fetchSearchRateEvidence(SEARCH_RATE_SOURCES[1],get as typeof fetch);
  expect(result.status).toBe("validated");expect(get.mock.calls[0][0])
    .toBe("https://docs.tavily.com/documentation/api-credits.md");
});
it.each([
  [SEARCH_RATE_SOURCES[0],braveHtml.replace("$5 per 1,000","$6 per 1,000"),"text/html"],
  [SEARCH_RATE_SOURCES[0],braveHtml.replace("<span>$5</span>","<span>$6</span>"),"text/html"],
  [SEARCH_RATE_SOURCES[0],braveHtml.replace("Search Plan","Answers Plan"),"text/html"],
  [SEARCH_RATE_SOURCES[1],tavilyMarkdown.replace("$0.008","$0.009"),"text/markdown"],
  [SEARCH_RATE_SOURCES[1],tavilyMarkdown.replace("$0.008 / Credit","$0.009 / Credit"),"text/markdown"],
  [SEARCH_RATE_SOURCES[1],tavilyMarkdown.replace("**2 API credits**","**3 API credits**"),"text/markdown"],
] as const)("holds changed or unparseable source %s",async(source,body,type)=>{
  const result=await fetchSearchRateEvidence(source,transport(body,type) as typeof fetch);
  expect(result.status).toBe("review-required");expect(result.tariffAdmitted).toBe(false);
});
it.each([206,302,404])("holds a non-complete HTTP %i response",async status=>{
  const result=await fetchSearchRateEvidence(SEARCH_RATE_SOURCES[0],
    transport(braveHtml,"text/html",status) as typeof fetch);
  expect(result.status).toBe("review-required");
});
it("keeps transport failures unavailable, and a non-HTML success review-required",async()=>{
  await expect(fetchSearchRateEvidence(SEARCH_RATE_SOURCES[0],
    transport("unavailable","text/html",503) as typeof fetch)).rejects.toThrow("unavailable");
  expect((await fetchSearchRateEvidence(SEARCH_RATE_SOURCES[1],
    transport(tavilyMarkdown,"text/html") as typeof fetch)).status).toBe("review-required");
});
