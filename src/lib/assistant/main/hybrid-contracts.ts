import { z } from 'zod';
import { toolResultSchema, type ModelMessage } from './contracts';

export const HYBRID_VERSION = 'hybrid-v1';
export const HYBRID_TOOLS = ['workflow_read', 'programmatic_read', 'programmatic_tools'] as const;
// An explicit capability list, not an effect=read shortcut: other read tools can spend money.
export const HYBRID_LEAVES = new Set([
  'company_search', 'company_read', 'customer_timeline', 'company_correspondence_list',
  'company_assessment_read', 'mail_read', 'mailbox_message_list', 'knowledge_search', 'knowledge_facts',
  'knowledge_compare', 'knowledge_originals', 'memory_read', 'memory_history_search',
]);
export const PROGRAM_VERSION = 'hybrid-program-v2';
export const PROGRAM_LEAVES = new Set([...HYBRID_LEAVES,
  'search_channel', 'external_search', 'company_research', 'evidence_collect',
  'role_correct', 'company_score', 'score_review',
]);
export const workflowInput = z.discriminatedUnion('workflow', [
  z.object({ workflow: z.literal('customer_recent'), query: z.string().trim().min(1).max(180),
    messageLimit: z.number().int().min(1).max(8).default(3) }).strict(),
  z.object({ workflow: z.literal('knowledge_evidence'), query: z.string().trim().min(2).max(4000),
    collections: z.array(z.enum(['industry', 'company', 'product'])).min(1).max(3).optional() }).strict(),
]);
export const programInput = z.object({ code: z.string().min(1).max(16000) }).strict();
export const hybridLeafSchema = z.object({ key: z.string(), tool: z.string(),
  arguments: z.record(z.string(), z.unknown()), output: toolResultSchema }).strict();
export type HybridLeaf = z.infer<typeof hybridLeafSchema>;
const legacyDataSchema = z.object({
  kind: z.literal(HYBRID_VERSION), route: z.enum(['workflow', 'interpreter']),
  value: z.unknown(), leaves: z.array(hybridLeafSchema).max(16),
  coverage: z.array(z.string()),
}).strict();
export const hybridDataSchema = z.union([legacyDataSchema, z.object({
  kind: z.literal(PROGRAM_VERSION), route: z.literal('interpreter'),
  value: z.unknown(), leaves: z.array(hybridLeafSchema).max(24), coverage: z.array(z.string()),
  handoff: z.string().nullable(),
}).strict()]);

/** Only paired server outputs can expand into provenance. User/program projections cannot. */
export function expandHybridEvidence(messages: ModelMessage[]): ModelMessage[] {
  const parents = new Set<string>();
  for (const message of messages) if (message.role === 'assistant') for (const call of message.tool_calls ?? []) {
    if (call.function.name !== 'execute_tool') continue;
    try { if (HYBRID_TOOLS.includes(JSON.parse(call.function.arguments).tool)) parents.add(call.id); } catch { /* Not executable. */ }
  }
  const expanded = [...messages];
  for (const message of messages) {
    if (message.role !== 'tool' || !parents.has(message.tool_call_id ?? '')) continue;
    const output = toolResultSchema.parse(JSON.parse(message.content ?? '{}'));
    if (output.data == null) continue; // Dispatch/validation failure, no leaves executed.
    const data = hybridDataSchema.parse(output.data);
    for (const [index, leaf] of data.leaves.entries()) {
      if (!(data.kind === PROGRAM_VERSION ? PROGRAM_LEAVES : HYBRID_LEAVES).has(leaf.tool)) throw new Error('Invalid hybrid evidence capability');
      if(!['success','partial'].includes(leaf.output.status)||leaf.output.data==null)continue;
      const id = `hybrid-evidence:${message.tool_call_id}:${index}`;
      expanded.push({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function',
        function: { name: 'execute_tool', arguments: JSON.stringify({ tool: leaf.tool, arguments: leaf.arguments }) } }] },
      { role: 'tool', tool_call_id: id, content: JSON.stringify(leaf.output) });
    }
  }
  return expanded;
}
