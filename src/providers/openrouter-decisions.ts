import { getOpenRouterConfig, openRouterRequestHeaders } from './openrouter';
import { buildDecisionRequest, DECISION_URL, parseDecisionResponse, type DecisionModel, type RouteState } from './decision-contract';
import { budgetedFetch } from '@/lib/billing/paid-fetch';

export class DecisionRequestError extends Error {
  constructor(readonly reason: 'http'|'invalid_response', readonly status?: number) {
    super(reason === 'http' ? `Decision HTTP ${status}` : 'Invalid decision response');
  }
}
/** One request, no SDK retry, no alternate model cascade. Entire response has a deadline. */
export async function requestDecision(model: DecisionModel, state: RouteState,
  options: {transport?: typeof fetch; timeoutMs?: number} = {}) {
  const body = JSON.stringify(buildDecisionRequest(model, state));
  if (Buffer.byteLength(body, 'utf8') > 32768) throw new Error('Decision input too large');
  const config = getOpenRouterConfig();
  const timeoutMs = options.timeoutMs ?? 2500;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10000) throw new Error('Invalid decision deadline');
  const response = await budgetedFetch(options.transport)(DECISION_URL, {
    method: 'POST', headers: openRouterRequestHeaders(config), body, redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new DecisionRequestError('http', response.status);
  try { return parseDecisionResponse(await response.json(), model); }
  catch { throw new DecisionRequestError('invalid_response'); }
}
