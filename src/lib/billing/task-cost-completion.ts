import { z } from "zod";
import type { PoolClient } from "pg";
import { allocateCompanyCost, costAttributionSchema } from "./cost-allocation";

export const taskCostCompletionSchema = z.object({
  version: z.literal("task-cost-completion-v1"),
  roundKey: z.string().regex(/^[a-f0-9]{64}$/),
  processedCompanyKeys: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(10000),
}).strict();

/** Called inside the result transaction. Never modifies money or historical observations. */
export async function completeTaskCostAllocation(client: PoolClient, userId: string, operationId: string,
  roundKey: string, processedCompanyKeys: string[] | undefined) {
  // Legacy checkpoints do not prove the complete processed population.
  if (processedCompanyKeys === undefined) return null;
  const completion = taskCostCompletionSchema.parse({ version: "task-cost-completion-v1", roundKey,
    processedCompanyKeys: [...new Set(processedCompanyKeys)].sort() });
  const rows = await client.query<{ id: string; reserved_micros: string; metrics: Record<string, unknown> }>(
    `select id,reserved_micros::text,metrics from paid_call_reservation
      where user_id=$1 and operation_id=$2 and metrics->'costAttribution'->>'roundKey'=$3 for update`,
    [userId, operationId, roundKey]);
  for (const row of rows.rows) {
    const parsed = costAttributionSchema.safeParse(row.metrics.costAttribution);
    if (!parsed.success || parsed.data.kind !== "task-shared") continue;
    const prior = row.metrics.costAllocationCompletion;
    if (prior !== undefined) {
      if (JSON.stringify(taskCostCompletionSchema.parse(prior)) !== JSON.stringify(completion)) {
        throw new Error("Completed cost allocation population changed");
      }
      continue;
    }
    const allocation = allocateCompanyCost({ basis: "reservation", amountMicros: Number(row.reserved_micros),
      attribution: parsed.data, completedTask: completion });
    await client.query(`update paid_call_reservation set metrics=metrics || $3::jsonb
      where user_id=$1 and id=$2`, [userId, row.id, JSON.stringify({
      costAllocationCompletion: completion, completedReservationAllocation: allocation,
    })]);
  }
  return completion;
}
