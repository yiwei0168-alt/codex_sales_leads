import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import nextEnv from '@next/env';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Pool } from 'pg';
import { getPool, tenantQuery } from '../src/lib/rag/db';
import { setSpendBudget } from '../src/lib/billing/repository';
import { observeMemory, undoMemory } from '../src/lib/knowledge/temporal-memory';
import { searchMemoryWithGraph } from '../src/lib/knowledge/memory-graph-search';
import { buildMainAgentGraph, executeMainAgentRun } from '../src/lib/assistant/main/graph';
import { defaultModelConfig } from '../src/lib/assistant/main/product';
import { MEMORY_CHANGED_REPLY } from '../src/lib/assistant/main/memory-message-guard';
import type { ModelMessage } from '../src/lib/assistant/main/contracts';

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
assert(base && ['localhost', '127.0.0.1', '::1'].includes(new URL(base).hostname), 'Local PostgreSQL required');
const state = JSON.parse(await readFile('tmp/ma11-replay-state.json', 'utf8')) as { database: string };
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database), 'Isolated clone required');
const receiptPath = 'tmp/g02-paid-revocation-state.json';
await assert.rejects(access(receiptPath), 'One-off paid acceptance has already been prepared; inspect its receipt before any new request');
const url = new URL(base);
url.pathname = `/${state.database}`;
process.env.DATABASE_URL = url.toString();
process.env.DATABASE_MIGRATION_URL = url.toString();
process.env.LANGSMITH_TRACING = 'false';
process.env.LANGCHAIN_TRACING_V2 = 'false';
const pool = new Pool({ connectionString: url.toString() });
const owner = randomUUID(), conversation = randomUUID(), runId = randomUUID(), leaseToken = randomUUID();
const marker = `G02 approved synthetic source ${randomUUID()}`;
const thread = `main-agent:${owner}:${runId}`;
let observationId = '', outbound = 0, revoked = false, prepared = false;
const originalFetch = globalThis.fetch;
const save = async (phase: string, extra: Record<string, unknown> = {}) => {
  const receipt = { phase, database: state.database, owner, runId, observationId,
    providerRequests: outbound, sourceRevoked: revoked, syntheticOnly: true, ...extra };
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
};
try {
  const model = defaultModelConfig();
  assert.equal(model.model, 'z-ai/glm-5.3', 'Diagnostic must use the configured current GLM route');
  assert.deepEqual(model.providers, ['fireworks'], 'Diagnostic must use the configured Fireworks provider');
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'G02 paid fixture','!','member','active')", [owner, `${owner}@example.invalid`]);
  await setSpendBudget(owner, 1_000_000); // USD 1 account reservation ceiling in this clone.
  await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'G02 paid source revocation')", [conversation, owner]);
  await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,execution_version,
      execution_kind,status,lease_token,lease_until) values($1,$2,$3,$1::uuid::text,$1::uuid::text,$4,$5,
      'g02-paid-diagnostic','main-agent','running',$6,now()+interval '10 minutes')`,
    [runId, owner, conversation, JSON.stringify({ content: 'Synthetic source revocation acceptance only.', requestKey: runId, attachments: [] }), JSON.stringify(model), leaseToken]);
  observationId = await observeMemory(owner, { kind: 'preference', memoryKey: marker,
    content: `${marker}: use a weekly summary.`, sourceReceipt: { type: 'g02-approved-synthetic', id: randomUUID() } });
  const saved = await searchMemoryWithGraph(owner, marker, new Date().toISOString(), new Date().toISOString(), undefined, async () => [observationId]);
  assert(saved.rows.some(row => row.id === observationId));
  const messages: ModelMessage[] = [
    { role: 'system', content: 'This is a synthetic safety diagnostic. Answer briefly. Do not use tools or mention private data.' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'memory-read', type: 'function', function: {
      name: 'execute_tool', arguments: JSON.stringify({ tool: 'memory_observation_search', arguments: { query: marker } }),
    } }] },
    { role: 'tool', tool_call_id: 'memory-read', content: JSON.stringify({ status: 'success', data: saved }) },
    { role: 'user', content: 'What response cadence does the synthetic record specify? Answer in one sentence.' },
  ];
  const saver = new PostgresSaver(getPool(), undefined, { schema: 'langgraph' });
  const seed = buildMainAgentGraph({ boundary: async () => ({ control: null, instructions: [] }),
    model: async () => { throw new Error('Seed graph must not call a model'); },
    tool: async () => { throw new Error('Seed graph must not call a tool'); } }, saver);
  await seed.updateState({ configurable: { thread_id: thread, checkpoint_ns: '' } },
    { messages, pending: [], steps: 0, status: 'running', reply: '', seen: {}, instructionIds: [], decisionRevision: 0, policyRevision: '' }, 'safe_boundary');
  assert.equal((await seed.getState({ configurable: { thread_id: thread, checkpoint_ns: '' } })).values.messages.length, messages.length);
  await save('prepared', { model: model.model, provider: model.providers[0], maximumProviderRequests: 1,
    accountReservationCeilingUsd: 1 });
  prepared = true;
  globalThis.fetch = async (input, init) => {
    const target = new URL(input instanceof Request ? input.url : String(input));
    if (target.origin !== 'https://openrouter.ai' || target.pathname !== '/api/v1/chat/completions')
      return originalFetch(input, init);
    if (++outbound !== 1) throw new Error('G02 diagnostic provider request cap reached; no retry sent');
    await save('provider-request-started');
    const response = await originalFetch(input, init);
    if (response.ok) {
      await undoMemory(owner, observationId);
      revoked = true;
      await save('source-revoked-after-provider-response', { providerHttpStatus: response.status });
    } else await save('provider-error', { providerHttpStatus: response.status });
    return response;
  };
  const result = await executeMainAgentRun(owner, runId, leaseToken);
  const finalState = await seed.getState({ configurable: { thread_id: thread, checkpoint_ns: '' } });
  const [run] = await tenantQuery<{ status: string; result: { reply?: string } }>(owner,
    'select status,result from agent_run where id=$1 and user_id=$2', [runId, owner]);
  const [counts] = await tenantQuery<{ model_calls: number; other_calls: number }>(owner,
    `select count(*) filter(where tool_id='main_model')::int as model_calls,
      count(*) filter(where tool_id<>'main_model')::int as other_calls
     from agent_tool_call where run_id=$1 and user_id=$2`, [runId, owner]);
  const [billing] = await tenantQuery<{ reservations: number; unsettled: number }>(owner,
    `select count(*)::int as reservations,count(*) filter(where status='reserved')::int as unsettled
     from paid_call_reservation where user_id=$1 and operation_id=$2`, [owner, runId]);
  const passed = result.status === 'partial' && run?.status === 'partial' && revoked && outbound === 1
    && counts?.model_calls === 1 && counts.other_calls === 0
    && finalState.values.messages.length === messages.length && finalState.values.reply === MEMORY_CHANGED_REPLY;
  await save(passed ? 'passed' : 'failed', { runStatus: run?.status, modelJournalEntries: counts?.model_calls,
    nonModelToolEntries: counts?.other_calls, billingReservations: billing?.reservations,
    unsettledBillingReservations: billing?.unsettled, staleAnswerDiscarded: passed,
    savedMessageCount: finalState.values.messages.length, expectedMessageCount: messages.length,
    sourceChangedReply: finalState.values.reply === MEMORY_CHANGED_REPLY });
  console.log(JSON.stringify({ passed, isolatedClone: state.database, route: model.model, provider: model.providers[0],
    providerRequests: outbound, sourceRevoked: revoked, runStatus: run?.status, nonModelToolEntries: counts?.other_calls,
    billingReservations: billing?.reservations, unsettledBillingReservations: billing?.unsettled, receiptPath }));
  assert(passed, 'G02 paid source revocation acceptance did not pass');
} catch (error) {
  if (prepared) await save('failed', { error: error instanceof Error ? error.message : String(error) });
  throw error;
} finally {
  globalThis.fetch = originalFetch;
  await pool.end();
  await getPool().end();
}
