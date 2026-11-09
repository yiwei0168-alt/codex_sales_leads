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
  coverage.push(`The first timeline page lists ${page.data.events.length} events; read ${messages.length} latest message bodies. Scope is imported mail only, not a new mailbox sync.`);
  const unreadBodies = page.data.events.length - messages.length;
  coverage.push(unreadBodies > 0
    ? `${unreadBodies} listed event(s) on this page have unread bodies. Their timeline excerpts were returned; this does not mean another timeline page exists.`
    : 'Every message body on the returned timeline page was read.');
  coverage.push(page.data.hasMore
    ? 'The timeline reports another page. Events and bodies on later pages were not read; their count is unknown. Continue dynamically if the requested range or completeness requires them.'
    : 'The timeline reports no further page (hasMore=false). Do not claim that additional older timeline records exist.');
  if (unreadBodies > 0)
    coverage.push('Read the remaining listed bodies dynamically if their full content is needed to answer the request.');
  return { timeline, messages };
}
