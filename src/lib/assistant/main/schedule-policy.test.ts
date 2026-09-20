import { describe, expect, it } from "vitest";
import { nextScheduleTime, schedulePlanSchema, validTimeZone } from "./schedule-policy";
describe("explicit account schedules", () => {
  it("uses account wall-clock time and advances beyond downtime without catch-up", () => {
    expect(nextScheduleTime({ kind: "weekly", days: [1], time: "09:00" }, "Asia/Shanghai", new Date("2026-09-20T12:00:00Z"))?.toISOString()).toBe("2026-09-21T01:00:00.000Z");
    expect(nextScheduleTime({ kind: "interval", minutes: 60 }, "Asia/Shanghai", new Date("2026-09-20T12:00:00Z"))?.toISOString()).toBe("2026-09-20T13:00:00.000Z");
  });
  it("does not repeat an expired one-time occurrence", () => {
    expect(nextScheduleTime({ kind: "once", at: "2026-09-20T12:00:00Z" }, "Asia/Shanghai", new Date("2026-09-20T12:00:00Z"))).toBeNull();
  });
  it("skips a nonexistent DST time", () => {
    expect(nextScheduleTime({ kind: "weekly", days: [0], time: "02:30" }, "America/New_York", new Date("2026-03-08T05:00:00Z"))?.toISOString()).toBe("2026-03-15T06:30:00.000Z");
  });
  it("runs a repeated DST time only on the first instant", () => {
    const plan = { kind: "weekly" as const, days: [0], time: "01:30" };
    expect(nextScheduleTime(plan, "America/New_York", new Date("2026-11-01T04:00:00Z"))?.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(nextScheduleTime(plan, "America/New_York", new Date("2026-11-01T05:30:00Z"))?.toISOString()).toBe("2026-11-08T06:30:00.000Z");
  });
  it("rejects malformed recurrence and timezone", () => {
    expect(schedulePlanSchema.safeParse({ kind: "interval", minutes: 0 }).success).toBe(false);
    expect(validTimeZone("secret/path")).toBe(false);
  });
});
