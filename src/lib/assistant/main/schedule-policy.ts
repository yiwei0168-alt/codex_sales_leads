import { z } from "zod";
export const schedulePlanSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("once"), at: z.iso.datetime({ offset: true }) }).strict(),
  z.object({ kind: z.literal("interval"), minutes: z.number().int().min(1).max(525600) }).strict(),
  z.object({ kind: z.literal("weekly"), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), days: z.array(z.number().int().min(0).max(6)).min(1).max(7) }).strict(),
]);
export type SchedulePlan = z.infer<typeof schedulePlanSchema>;
export function validTimeZone(value: string) { try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; } }
export function nextScheduleTime(plan: SchedulePlan, timezone: string, after: Date): Date | null {
  if (!validTimeZone(timezone) || !Number.isFinite(after.getTime())) throw new Error("Invalid schedule time");
  if (plan.kind === "once") return Date.parse(plan.at) > after.getTime() ? new Date(plan.at) : null;
  if (plan.kind === "interval") return new Date(after.getTime() + plan.minutes * 60_000);
  const format = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // Match actual instants, skipping nonexistent DST times. The next cursor is strictly future.
  for (let time = Math.floor(after.getTime() / 60_000) * 60_000 + 60_000; time <= after.getTime() + 8 * 86400_000; time += 60_000) {
    const parts = Object.fromEntries(format.formatToParts(time).map(p => [p.type, p.value]));
    if (plan.days.includes(days.indexOf(parts.weekday)) && `${parts.hour}:${parts.minute}` === plan.time) {
      // A repeated wall-clock time during DST fall-back is one occurrence. Only
      // the first actual instant is eligible, even when a worker resumes later.
      const key = format.format(time);
      let duplicate = false;
      for (let earlier = time - 60_000; earlier >= time - 26 * 3600_000; earlier -= 60_000) {
        if (format.format(earlier) === key) { duplicate = true; break; }
      }
      if (!duplicate) return new Date(time);
    }
  }
  throw new Error("No future occurrence found");
}
