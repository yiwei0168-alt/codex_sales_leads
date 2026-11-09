import { z } from 'zod';
import { digest, result, type ExecutionContext, type ToolResult } from './contracts';
import { PROGRAM_LEAVES, PROGRAM_VERSION, programInput, type HybridLeaf } from './hybrid-contracts';
import { HybridStop, runReadWorkflow } from './hybrid-workflows';
import { interpretReadProgram } from './hybrid-interpreter';
import type { HybridDependencies } from './hybrid-execution';

const requestSchema = z.object({ tool: z.string(), arguments: z.record(z.string(), z.unknown()) }).strict();
type Request = z.infer<typeof requestSchema>;
class Handoff extends HybridStop {
  constructor(reason: string, readonly value: unknown) { super(reason); }
}

/** Bounded segments, not an autonomous second agent. Every leaf uses the normal dispatcher. */
export async function executeProgrammatic(input: unknown, context: ExecutionContext,
  deps: HybridDependencies): Promise<ToolResult> {
  if (!context.callId) return result(null, { status: 'unavailable', missing: ['Persisted parent call required'] });
  const leaves: HybridLeaf[] = [], coverage: string[] = [], missing: string[] = [];
  const scope = digest({ version: PROGRAM_VERSION, input });
  const started = Date.now();
  let submitted = 0, bytes = 0, stopped = false;
  let value: unknown = null, handoff: string | null = null;
  const check = (requests: Request[]) => {
    if (stopped || Date.now() - started > 180000) throw new HybridStop('Segment stopped or time budget reached. Continue from saved receipts.');
    if (submitted + requests.length > 24) throw new HybridStop('Segment limit is 24 calls. Continue from saved receipts.');
    if (requests.some(r => !PROGRAM_LEAVES.has(r.tool) || !deps.allowed.has(r.tool)))
      throw new HybridStop('Tool is outside this segment capability list or current user/mode/scope.');
  };
  const batch = async (requests: Request[]): Promise<ToolResult[]> => {
    check(requests); // Reject the entire batch before any effect if one capability is invalid.
    const outputs: ToolResult[] = [];
    for (let offset = 0; offset < requests.length; offset += 3) {
      const wave = requests.slice(offset, offset + 3);
      check(wave);
      await deps.validate(leaves);
      const base = submitted;
      submitted += wave.length; // IDs are submission ordered, never completion ordered.
      const settled = await Promise.allSettled(wave.map(async (request, i) => {
        const key = `program:${digest({ parent: context.callId, scope, index: base + i, ...request })}`;
        const output = await deps.dispatch({ id: key, type: 'function', function: {
          name: 'execute_tool', arguments: JSON.stringify(request),
        } }, context);
        return { key, ...request, output };
      }));
      // Drain all in-flight calls before returning or propagating lease/source failures.
      for (const item of settled) if (item.status === 'fulfilled') {
        leaves.push(item.value);
        bytes += JSON.stringify(item.value.output).length;
        outputs.push(item.value.output);
      }
      const failure = settled.find(item => item.status === 'rejected');
      if (failure?.status === 'rejected') { stopped = true; throw failure.reason; }
      await deps.validate(leaves);
      const incomplete = outputs.find(o => o.status !== 'success');
      if (incomplete || bytes > 1_000_000) {
        stopped = true;
        if (incomplete) missing.push(...incomplete.missing);
        throw new HybridStop(incomplete
          ? `Leaf status ${incomplete.status}; return to the model using saved receipts. Do not repeat unknown outcomes.`
          : 'Evidence size limit reached. Narrow saved evidence before continuing.');
      }
    }
    return outputs;
  };
  const call = async (tool: string, args: Record<string, unknown>) => (await batch([{ tool, arguments: args }]))[0];
  try {
    const { code } = programInput.parse(input);
    value = await interpretReadProgram(code, async (kind, payload) => {
      const parsed: unknown = JSON.parse(payload);
      if (kind === 'workflow') return JSON.stringify(await runReadWorkflow(parsed, call, coverage));
      const request = requestSchema.parse(parsed);
      return JSON.stringify(await call(request.tool, request.arguments));
    }, { memoryBytes: 16 * 1024 * 1024, activeMs: 2000, wallMs: 180000 }, async (kind, payload) => {
      if (kind === 'parallel') return JSON.stringify(await batch(z.array(requestSchema).min(1).max(24).parse(JSON.parse(payload))));
      const transfer = z.object({ reason: z.string().trim().min(1).max(2000), value: z.unknown() }).strict().parse(JSON.parse(payload));
      throw new Handoff(transfer.reason, transfer.value);
    });
  } catch (error) {
    if (!(error instanceof HybridStop || error instanceof z.ZodError)) throw error;
    handoff = error instanceof HybridStop ? error.reason : 'Invalid program arguments; review schemas before continuing.';
    if (error instanceof Handoff) value = error.value;
    missing.push(handoff);
  }
  await deps.validate(leaves);
  coverage.push('Program projections are not new evidence. Original host receipts, source IDs and versions remain authoritative.',
    'Search/collection may be incomplete. Specialist scoring calls still use their own models and unchanged scoring policy. No official score publication or customer writes.');
  if (!leaves.length) missing.push('No tool evidence collected; computed output cannot establish business facts.');
  return result({ kind: PROGRAM_VERSION, route: 'interpreter', value, handoff, leaves, coverage }, {
    status: missing.length ? 'partial' : 'success', missing,
    sources: leaves.flatMap(l => l.output.sources), artifacts: leaves.flatMap(l => l.output.artifacts),
    cost: leaves.every(l => l.output.cost === 'known') ? 'known' : 'unknown',
  });
}
