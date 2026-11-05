import { z } from 'zod';
import { workflowInput } from './hybrid-contracts';
import type { ToolResult } from './contracts';

export type HybridCall = (tool: string, args: Record<string, unknown>) => Promise<ToolResult>;
export class HybridStop extends Error {
  constructor(public readonly reason: string) { super(reason); }
}

/** Reviewed deterministic recipes; also callable from the interpreter. No DB/API shortcuts. */
export async function runReadWorkflow(input: unknown, call: HybridCall, coverage: string[]) {
  const plan = workflowInput.parse(input);
  if (plan.workflow === 'knowledge_evidence') {
    const evidence = await call('knowledge_search', { query: plan.query, limit: 8,
      ...(plan.collections ? { collections: plan.collections } : {}) });
    coverage.push('Retrieved up to eight relevant blocks; this is not an exhaustive document review. Use dynamic tools for missing fields or conflicting sources.');
    if (!Array.isArray(evidence.data) || !evidence.data.length) throw new HybridStop('No knowledge evidence found; broaden or clarify the query.');
    return evidence;
  }
  const search = await call('company_search', { query: plan.query });
  const found = z.object({ matching: z.object({ requiresSelection: z.boolean() }),
    mailboxCustomers: z.object({ items: z.array(z.object({ id: z.uuid() }).passthrough()), hasMore: z.boolean() }) }).passthrough().safeParse(search.data);
  if (!found.success || found.data.matching.requiresSelection || found.data.mailboxCustomers.hasMore || found.data.mailboxCustomers.items.length !== 1)
    throw new HybridStop('Company identity is missing or ambiguous. Reuse company_search candidates and clarify; no company was merged or selected automatically.');
  const timeline = await call('customer_timeline', { customerId: found.data.mailboxCustomers.items[0].id, offset: 0 });
  const page = z.object({ events: z.array(z.object({ id: z.uuid() }).passthrough()), hasMore: z.boolean() }).passthrough().safeParse(timeline.data);
  if (!page.success || !page.data.events.length) throw new HybridStop('No imported timeline messages in the selected account scope.');
  const selected = page.data.events.slice(0, plan.messageLimit);
  const messages: ToolResult[] = [];
  for (const event of selected) {
    const mail = await call('mail_read', { messageId: event.id });
    if (mail.data == null) throw new HybridStop('An original message is unavailable; do not infer its contents from the excerpt.');
    messages.push(mail);
  }
  coverage.push(`Read ${messages.length} latest message bodies from the first timeline page. Older bodies were not read; imported mail only, not a new mailbox sync.`);
  if (page.data.hasMore || page.data.events.length > selected.length)
    coverage.push('Additional messages exist. Continue dynamically when the requested date range or completeness requires them.');
  return { timeline, messages };
}
