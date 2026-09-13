import {expect,it} from "vitest";
import {fxReferenceStatus,dynamicTariffStatus} from "./reference-status";
import {ECB_REFERENCE_URL} from "./ecb-reference";
const fx={usdNumerator:"1",nativeDenominator:"7",asOf:"2026-09-11T00:00:00Z",retrievedAt:"2026-09-11T01:00:00Z",reference:ECB_REFERENCE_URL,version:"fixture"};
it("shows the same strict 72-hour reference boundary, never refreshing its date",()=>{
  const deadline=Date.parse(fx.asOf)+72*3600000;
  expect(fxReferenceStatus(fx,deadline-1)).toMatchObject({status:"valid",effectiveExpiresAt:"2026-09-14T00:00:00.000Z"});
  expect(fxReferenceStatus(fx,deadline)).toMatchObject({status:"expired-or-invalid",asOf:fx.asOf});
  expect(fxReferenceStatus(fx,Date.parse(fx.asOf))).toMatchObject({status:"expired-or-invalid"});
});
it("keeps missing and untrusted references unknown rather than a valid zero",()=>{
  expect(fxReferenceStatus(undefined)).toMatchObject({status:"missing",asOf:null,effectiveExpiresAt:null});
  for(const invalid of [null,{}, {...fx,reference:"https://untrusted.invalid"},{...fx,usdNumerator:"0"}])expect(fxReferenceStatus(invalid)).toMatchObject({status:"invalid",asOf:null});
});
it("lists all reviewed dynamic models with the same seven-day deadline",()=>{
  const deadline=Date.parse("2026-09-20T00:00:00Z");
  expect(dynamicTariffStatus(deadline-1)).toHaveLength(3);
  expect(dynamicTariffStatus(deadline-1).every(rule=>rule.withinVerificationWindow)).toBe(true);
  expect(dynamicTariffStatus(deadline).every(rule=>!rule.withinVerificationWindow)).toBe(true);
});
