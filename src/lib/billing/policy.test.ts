import {expect,it} from "vitest";
import {dollarsToMicros,quoteRequest,type RequestBound} from "./policy";
const rule:RequestBound={key:"test",origin:"https://example.test",pathname:"/chat",model:"test-model",maximumChargeMicros:1000,maximumRequestBytes:500,maximumOutputTokens:200,boundDescription:"Fixture bound includes all tool calls and reasoning",reference:"https://example.test/rates",verifiedAt:"2026-01-01T00:00:00Z",expiresAt:"2027-01-01T00:00:00Z"};
const input={origin:rule.origin,pathname:rule.pathname,model:rule.model,requestBytes:100,outputTokens:100};
it("converts decimal dollars exactly without floating rounding",()=>{
  expect(dollarsToMicros("0.000001")).toBe(1);expect(dollarsToMicros("50.123456")).toBe(50123456);
  for(const bad of ["-1","1e2","0.1234567","NaN","1000001"])expect(()=>dollarsToMicros(bad)).toThrow();
});
it("fails closed for absent, duplicate, expired and unbounded tariffs",()=>{
  const now=Date.parse("2026-09-12T00:00:00Z");expect(quoteRequest(input,[rule],now)).toEqual(rule);
  expect(()=>quoteRequest(input,[],now)).toThrow("missing-tariff");expect(()=>quoteRequest(input,[rule,rule],now)).toThrow();
  expect(()=>quoteRequest(input,[rule],Date.parse(rule.expiresAt))).toThrow("expired-tariff");
  expect(()=>quoteRequest({...input,requestBytes:501},[rule],now)).toThrow("request-out-of-bounds");
  expect(()=>quoteRequest({...input,outputTokens:null},[rule],now)).toThrow("request-out-of-bounds");
});
