import { z } from 'zod';
import { digest, type ExecutionContext, type ProductTool } from './contracts';
import { hybridLeafSchema, type HybridLeaf } from './hybrid-contracts';
import { HybridStop } from './hybrid-workflows';
import type { HybridDependencies } from './hybrid-execution';

/** Read only original same-run journal rows, never a model-supplied output blob. */
export async function readInterpreterReceipt(context: ExecutionContext, callId: string,
  capabilities: ReadonlySet<string>, available: () => ProductTool[]): Promise<HybridLeaf> {
  const { boundary, assertCurrentInstructions, LeaseLostError } = await import('./repository');
  const { tenantQuery } = await import('@/lib/rag/db');
  const assertBoundary = async () => {
    const current = await boundary(context);
    if (current.control) throw new LeaseLostError();
    assertCurrentInstructions(context, current.instructions);
  };
  await assertBoundary();
  const rows = await tenantQuery<{id:string;call_key:string;tool_id:string;tool_version:string;input:Record<string,unknown>;input_hash:string;effect:string;output:unknown}>(context.userId,
    `select id,call_key,tool_id,tool_version,input,input_hash,effect,output from agent_tool_call
     where user_id=$1 and run_id=$2 and id=$3 and status='completed'`,
    [context.userId, context.runId, z.uuid().parse(callId)]);
  const row = rows[0];
  await assertBoundary();
  const tool = row && available().find(t => t.id === row.tool_id);
  if (!row || !tool || !capabilities.has(row.tool_id) || tool.version !== row.tool_version ||
    row.effect !== tool.effect || !(tool.effect === 'read' || (tool.id === 'evidence_collect' && tool.effect === 'reversible')) ||
    row.input_hash !== digest(row.input) || !tool.input.safeParse(row.input).success)
    throw new HybridStop('Saved receipt unavailable in the current account, task or tool scope.');
  const leaf = hybridLeafSchema.parse({key:row.call_key,tool:row.tool_id,arguments:row.input,output:row.output});
  if (leaf.output.callId !== callId || leaf.output.status !== 'success')
    throw new HybridStop('Only successful original leaf receipts can be reused; reconcile incomplete outcomes.');
  return leaf;
}

/** Reused evidence consumes the same size/count budget as new reads. */
export function receiptReader(leaves: HybridLeaf[], deps: HybridDependencies, capabilities: ReadonlySet<string>, limit: number) {
  return async (payload: string) => {
    const callId = z.uuid().parse(JSON.parse(payload));
    if (!deps.readReceipt) throw new HybridStop('Saved receipt lookup is unavailable.');
    if (leaves.length >= limit) throw new HybridStop('Evidence receipt limit reached.');
    const leaf = await deps.readReceipt(callId);
    if (!capabilities.has(leaf.tool) || !deps.allowed.has(leaf.tool) || leaf.output.callId !== callId || leaf.output.status !== 'success')
      throw new HybridStop('Saved receipt is outside current capabilities or incomplete.');
    const previous = leaves.find(l => l.output.callId === callId);
    if (previous && digest(previous) !== digest(leaf)) throw new HybridStop('Saved receipt identity changed.');
    const candidate = previous ? leaves : [...leaves, leaf];
    if (JSON.stringify(candidate).length > 1_000_000) throw new HybridStop('Evidence size limit reached.');
    await deps.validate(candidate);
    if (!previous) leaves.push(leaf);
    return JSON.stringify(leaf.output);
  };
}
