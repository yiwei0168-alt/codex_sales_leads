import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import nextEnv from '@next/env';
import { Client } from '@langchain/langgraph-sdk';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Pool } from 'pg';
import { getPool, tenantQuery } from '../src/lib/rag/db';
import { setSpendBudget } from '../src/lib/billing/repository';
import { observeMemory, undoMemory } from '../src/lib/knowledge/temporal-memory';
import { searchMemoryWithGraph } from '../src/lib/knowledge/memory-graph-search';
import { buildMainAgentGraph } from '../src/lib/assistant/main/graph';
import { MEMORY_CHANGED_REPLY } from '../src/lib/assistant/main/memory-message-guard';
import { defaultModelConfig } from '../src/lib/assistant/main/product';
import type { ModelMessage } from '../src/lib/assistant/main/contracts';

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
assert(base && ['localhost', '127.0.0.1', '::1'].includes(new URL(base).hostname));
const candidatePort = Number(process.argv[2] || '2025');
const productionSynthetic = candidatePort === 2024 && process.argv[3] === '--production-synthetic';
assert(productionSynthetic || [2025, 2026].includes(candidatePort));
const state = productionSynthetic ? null : JSON.parse(await readFile('tmp/ma11-replay-state.json', 'utf8')) as { database: string };
if (!productionSynthetic) {
  const candidatePath = candidatePort === 2026 ? 'tmp/g02-hotfix-candidate.json' : 'tmp/g02-candidate-server.json';
  const candidate = JSON.parse(await readFile(candidatePath, 'utf8')) as { port: number; database: string };
  assert(state && /^ma11_replay_[a-f0-9]{12}$/.test(state.database)
    && candidate.database === state.database && candidate.port === candidatePort);
}
const url = new URL(base);
if (state) url.pathname = `/${state.database}`;
process.env.DATABASE_URL = url.toString();
process.env.DATABASE_MIGRATION_URL = url.toString();
process.env.LANGSMITH_TRACING = 'false';
process.env.LANGCHAIN_TRACING_V2 = 'false';
const pool = new Pool({ connectionString: url.toString() });
const saver = new PostgresSaver(getPool(), undefined, { schema: 'langgraph' });
const owner = randomUUID(), conversation = randomUUID(), runId = randomUUID(), leaseToken = randomUUID();
const thread = `main-agent:${owner}:${runId}`, marker = `G02 HTTP synthetic ${randomUUID()}`;
let observationId = '';
try {
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'G02 HTTP fixture','!','member','active')", [owner, `${owner}@example.invalid`]);
  await setSpendBudget(owner, 0);
  await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'G02 HTTP source revocation')", [conversation, owner]);
  await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,execution_version,
    execution_kind,status,lease_token,lease_until) values($1,$2,$3,$1::uuid::text,$1::uuid::text,$4,$5,
    'g02-http-diagnostic','main-agent','running',$6,now()+interval '10 minutes')`,
  [runId, owner, conversation, JSON.stringify({ content: 'Synthetic HTTP source revocation only.', requestKey: runId, attachments: [] }),
    JSON.stringify(defaultModelConfig()), leaseToken]);
  observationId = await observeMemory(owner, { kind: 'preference', memoryKey: marker,
    content: `${marker}: use a weekly summary.`, sourceReceipt: { type: 'g02-http-synthetic', id: randomUUID() } });
  const saved = await searchMemoryWithGraph(owner, marker, new Date().toISOString(), new Date().toISOString(), undefined,
    async () => [observationId]);
  assert(saved.rows.some(row => row.id === observationId));
  const messages: ModelMessage[] = [
    { role: 'assistant', content: null, tool_calls: [{ id: 'memory-read', type: 'function', function: {
      name: 'execute_tool', arguments: JSON.stringify({ tool: 'memory_observation_search', arguments: { query: marker } }),
    } }] },
    { role: 'tool', tool_call_id: 'memory-read', content: JSON.stringify({ status: 'success', data: saved }) },
  ];
  const pending = { id: 'never-send', type: 'function' as const, function: {
    name: 'execute_tool', arguments: JSON.stringify({ tool: 'mail_send', arguments: { to: 'nobody@example.invalid' } }),
  } };
  const seed = buildMainAgentGraph({ boundary: async () => ({ control: null, instructions: [] }),
    model: async () => { throw new Error('No model in checkpoint seed'); },
    tool: async () => { throw new Error('No tool in checkpoint seed'); } }, saver);
  await seed.updateState({ configurable: { thread_id: thread, checkpoint_ns: '' } },
    { messages, pending: [pending], steps: 1, status: 'running', reply: '', seen: {}, instructionIds: [],
      decisionRevision: 0, policyRevision: '' }, 'safe_boundary');
  await undoMemory(owner, observationId);
  const sdk = new Client({ apiUrl: `http://127.0.0.1:${candidatePort}`, apiKey: null, callerOptions: { maxRetries: 0 } });
  const response = await sdk.runs.wait(null, 'main_agent_workflow', { input: { userId: owner, runId, leaseToken } });
  const snapshot = await seed.getState({ configurable: { thread_id: thread, checkpoint_ns: '' } });
  const [run] = await tenantQuery<{ status: string; result: { reply: string } }>(owner,
    'select status,result from agent_run where user_id=$1 and id=$2', [owner, runId]);
  const [calls] = await tenantQuery<{ count: number }>(owner,
    'select count(*)::int as count from agent_tool_call where user_id=$1 and run_id=$2', [owner, runId]);
  assert.equal((response as { result?: { status?: string } }).result?.status, 'partial');
  assert.equal(run.status, 'partial');
  assert.equal(run.result.reply, MEMORY_CHANGED_REPLY);
  assert.equal(snapshot.values.reply, MEMORY_CHANGED_REPLY);
  assert.equal(snapshot.values.messages.length, messages.length);
  assert.equal(snapshot.values.pending.length, 0);
  assert.equal(calls.count, 0);
  console.log(JSON.stringify({ candidatePort, databaseScope: state?.database ?? 'product-local-synthetic', httpGraph: 'main_agent_workflow',
    runStatus: run.status, savedMessages: snapshot.values.messages.length, pendingActions: snapshot.values.pending.length,
    toolOrModelJournalEntries: calls.count, sourceChangedReply: true, cloudCalls: 0, externalEffects: 0 }));
} finally {
  await saver.deleteThread(thread);
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local session_replication_role=replica');
    await client.query('delete from assistant_message where user_id=$1', [owner]);
    await client.query('delete from agent_run_event where user_id=$1', [owner]);
    await client.query('delete from agent_run where user_id=$1', [owner]);
    await client.query('delete from assistant_conversation where user_id=$1', [owner]);
    await client.query('delete from agent_memory_conflict where owner_id=$1', [owner]);
    await client.query('delete from agent_memory_notice where owner_id=$1', [owner]);
    await client.query('delete from agent_memory_graph_outbox where observation_id in(select id from agent_memory_observation where owner_id=$1)', [owner]);
    await client.query('delete from agent_memory_observation where owner_id=$1', [owner]);
    await client.query('delete from app_user where id=$1', [owner]);
    await client.query('commit');
  } catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); await pool.end(); await getPool().end(); }
}
