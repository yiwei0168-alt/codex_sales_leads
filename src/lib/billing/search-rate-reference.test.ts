import {expect,it,vi} from "vitest";
import {SEARCH_RATE_SOURCES,fetchSearchRateEvidence,parseBraveSearchRate,parseTavilySearchRate,
  parseExaSearchRate,parseGooglePlacesRate} from "./search-rate-reference";

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
const exaHtml=`<html><h2>Endpoint pricing</h2><table><tr><th>Endpoint</th><th>Search</th><th>Deep Search</th><th>Deep-Reasoning Search</th><th>Contents</th><th>Monitors</th><th>Answer</th></tr>
<tr><td>Base price, with up to 10 results (per 1k requests)</td><td>$7</td><td>$12</td><td>$15</td><td>$1 (per 1k pages)</td><td>$15</td><td>$5</td></tr>
<tr><td>Cost per additional result above 10 (per 1k requests)</td><td>$1</td><td>$1</td><td>$1</td></tr>
<tr><td>AI page summaries (per 1k pages)</td><td>$1</td><td>$1</td></tr></table><h2>Agent pricing</h2></html>`;
const placesHtml=`<html><table><tr><td>Places API Text Search Enterprise</td><td>E967-44BC-B44D</td><td>1,000</td><td>$35.00</td><td>$28.00</td></tr>
<tr><td>Places API Text Search Enterprise + Atmosphere</td><td>120C-BEC3-B48F</td><td>1,000</td><td>$40.00</td></tr></table></html>`;
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
it("extracts Exa Search units without confusing Deep Search or standalone Contents",async()=>{
  expect(parseExaSearchRate(exaHtml)).toEqual({searchUsdPer1000Requests:7,
    additionalResultUsdPer1000:1,summaryUsdPer1000Pages:1,contentsUsdPer1000Pages:1});
  expect((await fetchSearchRateEvidence(SEARCH_RATE_SOURCES[2],transport(exaHtml,"text/html") as typeof fetch)).status)
    .toBe("validated");
});
it("extracts Google's exact Enterprise Text Search SKU, excluding Atmosphere",async()=>{
  expect(parseGooglePlacesRate(placesHtml)).toEqual({sku:"E967-44BC-B44D",usdPer1000Events:35});
  expect((await fetchSearchRateEvidence(SEARCH_RATE_SOURCES[3],transport(placesHtml,"text/html") as typeof fetch)).status)
    .toBe("validated");
});
it.each([
  [SEARCH_RATE_SOURCES[0],braveHtml.replace("$5 per 1,000","$6 per 1,000"),"text/html"],
  [SEARCH_RATE_SOURCES[0],braveHtml.replace("<span>$5</span>","<span>$6</span>"),"text/html"],
  [SEARCH_RATE_SOURCES[0],braveHtml.replace("Search Plan","Answers Plan"),"text/html"],
  [SEARCH_RATE_SOURCES[1],tavilyMarkdown.replace("$0.008","$0.009"),"text/markdown"],
  [SEARCH_RATE_SOURCES[1],tavilyMarkdown.replace("$0.008 / Credit","$0.009 / Credit"),"text/markdown"],
  [SEARCH_RATE_SOURCES[1],tavilyMarkdown.replace("**2 API credits**","**3 API credits**"),"text/markdown"],
  [SEARCH_RATE_SOURCES[2],exaHtml.replace("<td>$7</td>","<td>$8</td>"),"text/html"],
  [SEARCH_RATE_SOURCES[2],exaHtml.replace("<td>$1 (per 1k pages)</td>","<td>$2 (per 1k pages)</td>"),"text/html"],
  [SEARCH_RATE_SOURCES[3],placesHtml.replace("<td>$35.00</td>","<td>$36.00</td>"),"text/html"],
  [SEARCH_RATE_SOURCES[3],placesHtml.replace("E967-44BC-B44D","wrong-sku"),"text/html"],
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
