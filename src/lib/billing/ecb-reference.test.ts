import {expect,it,vi} from "vitest";
import {parseEcbCnyReference,fetchEcbCnyReference,ECB_REFERENCE_URL,MAX_REFERENCE_BYTES,StaleEcbReferenceError} from "./ecb-reference";
import {foreignReservationMicros} from "./fx-policy";
const now="2026-09-13T05:00:00Z";
const xml="<Cube><Cube time='2026-09-11'><Cube currency='USD' rate='1.1592'/><Cube currency='CNY' rate='7.7762'/></Cube></Cube>";
it("cross-converts same-date EUR quotes exactly and preserves the native reference without inventing transaction FX",()=>{
  const result=parseEcbCnyReference(xml,now);
  expect(result.fx).toMatchObject({usdNumerator:"1159200",nativeDenominator:"7776200",asOf:"2026-09-11T00:00:00.000Z",reference:ECB_REFERENCE_URL});
  expect(result.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  expect(foreignReservationMicros({currency:"CNY",maximumNativeMicros:1000000,fx:result.fx},Date.parse(now))).toBe(156524);
});
it("rejects missing/duplicate/invalid rates, ambiguous dates, XML entities, stale or future sources",()=>{
  for(const input of [xml.replace("currency='CNY'","currency='EUR'"),xml.replace("7.7762","0"),xml.replace("7.7762","NaN"),
    xml+"<Cube currency='USD' rate='1.1592'/>",xml+"<Cube time='2026-09-12'/>","<!DOCTYPE fixture>"+xml,
    xml.replace("2026-09-11","2026-09-03"),xml.replace("2026-09-11","2026-09-14"),xml.replace("2026-09-11","2026-02-31")])
    expect(()=>parseEcbCnyReference(input,now)).toThrow();
  expect(()=>parseEcbCnyReference(xml,"2026-09-18T00:00:00Z")).toThrow();
  expect(()=>parseEcbCnyReference(xml,"2026-09-18T00:00:00Z")).toThrow(StaleEcbReferenceError);
  expect(parseEcbCnyReference(xml,"2026-09-17T23:59:59Z").referenceDate).toBe("2026-09-11");
});
it("fetches only the fixed credential-free official feed with a bounded response",async()=>{
  const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response(xml));
  expect((await fetchEcbCnyReference(transport,Date.parse(now))).bytes).toBe(Buffer.byteLength(xml));
  expect(transport).toHaveBeenCalledWith(ECB_REFERENCE_URL,expect.objectContaining({redirect:"error"}));
  expect(transport.mock.calls[0][1]).not.toHaveProperty("headers");
  await expect(fetchEcbCnyReference(vi.fn().mockResolvedValue(new Response("x".repeat(MAX_REFERENCE_BYTES+1))),Date.parse(now))).rejects.toThrow("oversized");
});
