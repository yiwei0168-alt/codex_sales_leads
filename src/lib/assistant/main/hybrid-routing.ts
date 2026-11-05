import { digest, type ModelMessage } from './contracts';

export function hybridEnabled() { return process.env.ENABLE_HYBRID_EXECUTION !== '0'; }
export type HybridRoute = { path: 'workflow' | 'dynamic' | 'interpreter'; reason: string;
  workflow?: { workflow: 'customer_recent'; query: string; messageLimit: number } };

/** Advisory routing. Unknown/mixed intents remain dynamic, with the entire request intact. */
export function suggestHybridRoute(content: string, hasHistory = false, hasAttachments = false): HybridRoute {
  if (hasHistory || hasAttachments) return { path: 'dynamic', reason: 'Conversation or attachments require contextual planning.' };
  // Only a complete, narrow utterance may bypass the initial planning model.
  const match = /^(?:请)?(?:查看|查询|总结)\s*([A-Za-z0-9][A-Za-z0-9. -]{0,79})\s*(?:的)?(?:最新进展|近期进展|最近进展)[。？！?！!]?$/u.exec(content.trim());
  if (match) return { path: 'workflow', reason: 'Single explicit company recent-progress read.',
    workflow: { workflow: 'customer_recent', query: match[1].trim(), messageLimit: 3 } };
  if (/(批量|逐家|每家公司|多家公司|分页|遍历|汇总.*(?:家|份)|batch|for each)/iu.test(content))
    return { path: 'interpreter', reason: 'Batch structure may benefit from bounded programmatic reads; model checks suitability.' };
  return { path: 'dynamic', reason: 'No exact reviewed workflow match; keep open planning.' };
}

export function hybridFirstAction(messages: ModelMessage[]): ModelMessage | null {
  const users = messages.filter(message => message.role === 'user');
  if (users.length !== 1 || messages.some(message => message.role === 'assistant')) return null;
  // Only a freshly initialized, enabled production context receives this server marker.
  if (!messages.some(message => message.role === 'system' && message.content?.startsWith('[hybrid-v1:eligible]'))) return null;
  const route = suggestHybridRoute(users[0].content ?? '');
  if (!route.workflow) return null;
  return { role: 'assistant', content: null, tool_calls: [{ id: `hybrid_route_${digest(route.workflow).slice(0,32)}`,
    type: 'function', function: { name: 'execute_tool', arguments: JSON.stringify({ tool: 'workflow_read', arguments: route.workflow }) } }] };
}
