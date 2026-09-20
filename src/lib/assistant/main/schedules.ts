import { z } from "zod";
import { tenantQuery, tenantTransaction, query } from "@/lib/rag/db";
import { enqueueRun } from "./repository";
import { defaultModelConfig } from "./product";
import { schedulePlanSchema, nextScheduleTime, validTimeZone, type SchedulePlan } from "./schedule-policy";
export const scheduleInputSchema = z.object({ title: z.string().min(1).max(180), content: z.string().min(2).max(100_000), timezone: z.string().max(120).refine(validTimeZone).optional(), plan: schedulePlanSchema }).strict();
export async function createSchedule(userId: string, input: z.infer<typeof scheduleInputSchema>) {
  const parsed = scheduleInputSchema.parse(input);
  const user = await tenantQuery<{ timezone: string }>(userId, "select timezone from app_user where id=$1", [userId]);
  const timezone = parsed.timezone ?? user[0]?.timezone ?? "Asia/Shanghai";
  const next = nextScheduleTime(parsed.plan, timezone, new Date());
  if (!next) throw new Error("Schedule must be in the future");
  return (await tenantQuery(userId, "insert into agent_schedule(user_id,title,content,timezone,plan,next_run_at) values($1,$2,$3,$4,$5,$6) returning id,version,next_run_at,timezone", [userId, parsed.title, parsed.content, timezone, JSON.stringify(parsed.plan), next.toISOString()]))[0];
}
export async function listSchedules(userId: string) { return tenantQuery(userId, "select id,title,content,timezone,plan,enabled,version,next_run_at,active_run_id from agent_schedule where user_id=$1 order by created_at desc limit 100", [userId]); }
export async function changeSchedule(userId: string, id: string, version: number, enabled: boolean) {
  return (await tenantQuery(userId, "update agent_schedule set enabled=$4,version=version+1,updated_at=now() where user_id=$1 and id=$2 and version=$3 returning id", [userId, id, version, enabled])).length === 1;
}
export async function dispatchDueSchedule(scheduleId?: string) {
  const claimed = (await query<{ id: string; user_id: string; lease_token: string }>("select * from claim_next_agent_schedule($1)", [scheduleId ?? null]))[0];
  if (!claimed) return false;
  await tenantTransaction(claimed.user_id, async client => {
    const found = await client.query<{ id: string; title: string; content: string; timezone: string; plan: SchedulePlan; next_run_at: Date; version: number }>("select * from agent_schedule where user_id=$1 and id=$2 and lease_token=$3 and enabled and lease_until>now() for update", [claimed.user_id, claimed.id, claimed.lease_token]);
    const schedule = found.rows[0]; if (!schedule) return;
    // Unique occurrence key makes a crash between enqueue and schedule settlement recoverable.
    const run = await enqueueRun(claimed.user_id, { content: schedule.content,
      requestKey: `schedule:${schedule.id}:${schedule.version}:${schedule.next_run_at.toISOString()}`, attachments: [] }, defaultModelConfig());
    const next = schedule.plan.kind === "once" ? null : nextScheduleTime(schedule.plan, schedule.timezone, new Date());
    await client.query("update agent_schedule set active_run_id=$3,enabled=$4,next_run_at=coalesce($5,next_run_at),lease_until=null,updated_at=now() where user_id=$1 and id=$2", [claimed.user_id, schedule.id, run.id, Boolean(next), next?.toISOString() ?? null]);
  });
  return true;
}
