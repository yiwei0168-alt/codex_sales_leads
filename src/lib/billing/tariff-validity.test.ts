import {expect,it} from 'vitest';
import {tariffValidity} from './tariff-validity';
const rule={verifiedAt:'2026-09-13T00:00:00Z',expiresAt:'2026-10-01T00:00:00Z'};
it('shows the actual seven-day deadline and rejects the boundary',()=>{
  expect(tariffValidity(rule,Date.parse('2026-09-19T23:59:59Z'))).toEqual({withinVerificationWindow:true,effectiveExpiresAt:'2026-09-20T00:00:00.000Z'});
  expect(tariffValidity(rule,Date.parse('2026-09-20T00:00:00Z')).withinVerificationWindow).toBe(false);
});
it('uses the earliest promotion or expiry and rejects invalid or future verification',()=>{
  const now=Date.parse('2026-09-14T00:00:00Z');
  expect(tariffValidity({...rule,promotionEndsAt:'2026-09-14T00:00:00Z'},now).withinVerificationWindow).toBe(false);
  expect(tariffValidity({...rule,expiresAt:'2026-09-14T00:00:00Z'},now).withinVerificationWindow).toBe(false);
  for(const changed of [{...rule,verifiedAt:'invalid'},{...rule,promotionEndsAt:'invalid'},{...rule,verifiedAt:'2026-09-15T00:00:00Z'}])expect(tariffValidity(changed,now).withinVerificationWindow).toBe(false);
});
