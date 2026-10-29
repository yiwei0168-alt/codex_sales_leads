import {expect,it} from 'vitest';
import {nextDailySync} from './daily-sync';
import {mailboxRange} from './sync-options';
it('uses Beijing 08:00 and schedules the next day when enabled after the cutoff',()=>{
 expect(nextDailySync(new Date('2026-10-29T23:59:59Z'))).toBe('2026-10-30T00:00:00.000Z');
 expect(nextDailySync(new Date('2026-10-30T00:00:00Z'))).toBe('2026-10-31T00:00:00.000Z');
 expect(nextDailySync(new Date('2026-12-31T02:00:00Z'))).toBe('2027-01-01T00:00:00.000Z');
});
it('freezes a complete previous Beijing day across UTC month boundaries',()=>{
 const r=mailboxRange({from:'2026-11-01',through:'2026-11-01',timeZone:'Asia/Shanghai'});
 expect(r.since.toISOString()).toBe('2026-10-31T16:00:00.000Z');
 expect(r.before?.toISOString()).toBe('2026-11-01T16:00:00.000Z');
});
