import {expect,it} from "vitest";
import {foreignReservationMicros,type ForeignCostBound} from "./fx-policy";
import {quoteRequest,type RequestBound} from "./policy";
import {withSpendContext} from "./context";
const now=Date.parse("2026-09-13T00:00:00Z");
const bound:ForeignCostBound={currency:"CNY",maximumNativeMicros:1_000_000,fx:{usdNumerator:"1",nativeDenominator:"7",asOf:"2026-09-12T00:00:00Z",retrievedAt:"2026-09-12T01:00:00Z",reference:"https://example.test/fx",version:"synthetic-fx-v1"}};
it("uses exact conversion and rounds the 5% buffered reservation upward",()=>{
  expect(foreignReservationMicros(bound,now)).toBe(150000);
  expect(foreignReservationMicros({...bound,maximumNativeMicros:1},now)).toBe(1);
});
it("rejects missing, future or week-old production FX without guessing parity",()=>{
  expect(()=>foreignReservationMicros({...bound,fx:{...bound.fx,nativeDenominator:"0"}},now)).toThrow();
  expect(foreignReservationMicros(bound,Date.parse("2026-09-19T00:59:59Z"))).toBe(150000);
  expect(()=>foreignReservationMicros(bound,Date.parse("2026-09-19T01:00:00Z"))).toThrow();
  expect(()=>foreignReservationMicros({...bound,fx:{...bound.fx,retrievedAt:"2026-09-19T00:00:00Z"}},Date.parse("2026-09-19T00:00:00Z"))).toThrow();
  expect(()=>foreignReservationMicros(bound,Date.parse("2026-09-11T00:00:00Z"))).toThrow();
});
it("pins one official version only inside a server-side acceptance scope",()=>{
  const later=Date.parse("2026-10-19T00:00:00Z");
  expect(()=>foreignReservationMicros(bound,later)).toThrow();
  withSpendContext({userId:"acceptance",operationId:"fixture",stage:"validation",
    fixedFxReferenceVersion:"synthetic-fx-v1"},()=>{
    expect(foreignReservationMicros(bound,later)).toBe(150000);
    expect(()=>foreignReservationMicros({...bound,fx:{...bound.fx,version:"other"}},later)).toThrow();
  });
  expect(()=>foreignReservationMicros(bound,later)).toThrow();
});
it("blocks a foreign tariff whose USD bound omits the buffer",()=>{
  const rule:RequestBound={key:"fixture",origin:"https://example.test",pathname:"/chat",model:"model",maximumChargeMicros:149999,maximumRequestBytes:100,maximumOutputTokens:10,boundDescription:"Synthetic all-inclusive native currency bound for testing",reference:"https://example.test/rates",verifiedAt:"2026-09-12T00:00:00Z",expiresAt:"2026-09-19T00:00:00Z",foreignCostBound:bound};
  const request={origin:rule.origin,pathname:rule.pathname,model:rule.model,requestBytes:10,outputTokens:10};
  expect(()=>quoteRequest(request,[rule],now)).toThrow("missing-tariff");
  expect(quoteRequest(request,[{...rule,maximumChargeMicros:150000}],now).maximumChargeMicros).toBe(150000);
});
