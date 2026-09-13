import {expect,it} from "vitest";
import {billingPolicy} from "./policy";
import {searchRequestFingerprint} from "./search-request-fingerprint";
const rule=(contract:string)=>billingPolicy.rules.find(item=>item.requestContract===contract)!;
it("guards all admitted synchronous search contracts",()=>{
  for(const contract of ["brave-web-search-v1","tavily-search-v1","exa-company-auto-text-v1","google-places-text-enterprise-v1","searchapi-google-bing-v1"]){
    const tariff=rule(contract);
    expect(searchRequestFingerprint(tariff,new Request(tariff.origin+tariff.pathname),{})).toMatch(/^[a-f0-9]{64}$/);
  }
});
it("ignores rotating credentials and object/query ordering while retaining actual query identity",()=>{
  const tariff=rule("searchapi-google-bing-v1");
  const hash=(url:string,body:Record<string,unknown>)=>searchRequestFingerprint(tariff,new Request(url),body);
  expect(hash("https://www.searchapi.io/api/v1/search?q=fixture&api_key=old&engine=google",{b:2,a:1}))
    .toBe(hash("https://www.searchapi.io/api/v1/search?engine=google&api_key=new&q=fixture",{a:1,b:2}));
  expect(hash("https://www.searchapi.io/api/v1/search?q=other",{})).not.toBe(hash("https://www.searchapi.io/api/v1/search?q=fixture",{}));
});
it("includes Places field mask but not its API credential",()=>{
  const tariff=rule("google-places-text-enterprise-v1");
  const hash=(mask:string,key:string)=>searchRequestFingerprint(tariff,new Request(tariff.origin+tariff.pathname,{headers:{"x-goog-fieldmask":mask,"x-goog-api-key":key}}),{textQuery:"fixture"});
  expect(hash("places.id,places.websiteUri","old")).toBe(hash("places.websiteUri,places.id","new"));
  expect(hash("places.id","old")).not.toBe(hash("places.id,places.websiteUri","old"));
});
it("does not turn model or polling contracts into search requests",()=>{
  expect(searchRequestFingerprint(billingPolicy.rules[0],new Request("https://example.invalid/poll"),{})).toBeUndefined();
});
