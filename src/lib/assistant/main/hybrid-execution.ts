import { z } from 'zod';
import { digest, result, type ExecutionContext, type ModelToolCall, type ToolResult } from './contracts';
import { HYBRID_LEAVES, HYBRID_VERSION, type HybridLeaf } from './hybrid-contracts';
import { HybridStop, runReadWorkflow } from './hybrid-workflows';
import { interpretReadProgram } from './hybrid-interpreter';
import { receiptReader } from './interpreter-receipts';
import { INTERPRETER_ABI } from './interpreter-time';

export interface HybridDependencies {
  dispatch: (call: ModelToolCall, context: ExecutionContext) => Promise<ToolResult>;
  allowed: ReadonlySet<string>;
  validate: (leaves: HybridLeaf[]) => Promise<void>;
  readReceipt?: (callId: string) => Promise<HybridLeaf>;
}
/** Parent and every leaf have separate durable receipts. Only local, allowlisted reads. */
export async function executeHybridRead(route: 'workflow' | 'interpreter', input: unknown,
  context: ExecutionContext, deps: HybridDependencies): Promise<ToolResult> {
  if (!context.callId) return result(null, { status: 'unavailable', missing: ['Persisted parent call required'] });
  const leaves: HybridLeaf[] = [], coverage: string[] = [], missing: string[] = [];
  const scope = digest({ version: HYBRID_VERSION, ...(route === 'interpreter' ? {abi: INTERPRETER_ABI} : {}), route, input });
  let bytes = 0, halted = false;
  const call = async (tool: string, args: Record<string, unknown>) => {
    if (halted) throw new HybridStop('Execution already stopped.');
    if (!HYBRID_LEAVES.has(tool) || !deps.allowed.has(tool)) {
      halted = true;
      throw new HybridStop('Requested tool is outside the current account, mode, collection or interpreter allowlist.');
    }
    if (leaves.length >= 16) { halted = true; throw new HybridStop('Sixteen-read limit reached; continue from saved receipts.'); }
    await deps.validate(leaves);
    const key = `hybrid:${digest({ parent: context.callId, scope, index: leaves.length, tool, args })}`;
    const output = await deps.dispatch({ id: key, type: 'function',
      function: { name: 'execute_tool', arguments: JSON.stringify({ tool, arguments: args }) } }, context);
    leaves.push({ key, tool, arguments: args, output });
    bytes = JSON.stringify(leaves).length;
    await deps.validate(leaves);
    if (bytes > 1_000_000) { halted = true; throw new HybridStop('Evidence limit reached; saved reads must be narrowed before further processing.'); }
    if (!['success', 'partial'].includes(output.status)) {
      halted = true; throw new HybridStop('A read did not complete successfully; do not retry an unknown receipt. Use dynamic planning to resolve missing input or access.');
    }
    if (output.status === 'partial') missing.push(...output.missing, `Partial leaf: ${tool}`);
    return output;
  };
  let value: unknown = null;
  try {
    if (route === 'workflow') value = await runReadWorkflow(input, call, coverage);
    else {
      const { code } = z.object({ code: z.string() }).parse(input);
      value = await interpretReadProgram(code, async (kind, payload) => {
        const parsed: unknown = JSON.parse(payload);
        if (kind === 'workflow') return JSON.stringify(await runReadWorkflow(parsed, call, coverage));
        const request = z.object({ tool: z.string(), arguments: z.record(z.string(), z.unknown()) }).strict().parse(parsed);
        return JSON.stringify(await call(request.tool, request.arguments));
      }, undefined, undefined, receiptReader(leaves, deps, HYBRID_LEAVES, 16));
      coverage.push('Program output is a computed projection, not new evidence. Full original leaf receipts are retained for source validation.');
      if (!leaves.length) missing.push('No tool evidence was read; computed output alone cannot establish business facts.');
    }
  } catch (error) {
    // Lease/control/source changes must reach the graph, never turn into a plausible result.
    if (!(error instanceof HybridStop || error instanceof z.ZodError)) throw error;
    missing.push(error instanceof HybridStop ? error.reason : 'Invalid workflow or bridge arguments; continue dynamically.');
    if (route === 'workflow') value = leaves.map(leaf => ({ tool: leaf.tool, output: leaf.output }));
  }
  await deps.validate(leaves);
  // Always retain the complete host-authored receipts, regardless of guest filtering or errors.
  return result({ kind: HYBRID_VERSION, route, value, leaves, coverage }, {
    status: missing.length ? 'partial' : 'success', missing,
    sources: leaves.flatMap(leaf => leaf.output.sources), artifacts: leaves.flatMap(leaf => leaf.output.artifacts),
    cost: leaves.every(leaf => leaf.output.cost === 'known') ? 'known' : 'unknown',
  });
}
