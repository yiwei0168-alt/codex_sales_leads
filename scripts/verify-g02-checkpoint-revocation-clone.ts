import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import nextEnv from '@next/env';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Pool } from 'pg';
import { getPool } from '../src/lib/rag/db';
import { observeMemory, undoMemory } from '../src/lib/knowledge/temporal-memory';
import { searchMemoryWithGraph } from '../src/lib/knowledge/memory-graph-search';
import { buildMainAgentGraph } from '../src/lib/assistant/main/graph';
import { assertCurrentMemoryMessages, MEMORY_CHANGED_REPLY } from '../src/lib/assistant/main/memory-message-guard';
import type { ModelMessage } from '../src/lib/assistant/main/contracts';

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
assert(base && ['localhost', '127.0.0.1', '::1'].includes(new URL(base).hostname), 'Local PostgreSQL required');
const state = JSON.parse(await readFile('tmp/ma11-replay-state.json', 'utf8')) as { database: string };
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database), 'Isolated clone required');
const url = new URL(base);
url.pathname = `/${state.database}`;
process.env.DATABASE_URL = url.toString();
process.env.LANGSMITH_TRACING = 'false';
process.env.LANGCHAIN_TRACING_V2 = 'false';
const pool = new Pool({ connectionString: url.toString() });
const owner = randomUUID(), thread = `g02-checkpoint:${owner}`, marker = `G02 checkpoint preference ${randomUUID()}`;
const saver = new PostgresSaver(getPool(), undefined, { schema: 'langgraph' });
const config = { configurable: { thread_id: thread, checkpoint_ns: '' } };
let observationId = '', modelCalls = 0, toolCalls = 0;
try {
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'G02 checkpoint fixture','!','member','active')", [owner, `${owner}@example.invalid`]);
  observationId = await observeMemory(owner, { kind: 'preference', memoryKey: marker,
    content: `${marker}: use a weekly summary.`, sourceReceipt: { type: 'g02-checkpoint-synthetic', id: randomUUID() } });
  const saved = await searchMemoryWithGraph(owner, marker, new Date().toISOString(), new Date().toISOString(), undefined, async () => [observationId]);
  assert(saved.rows.some(row => row.id === observationId));
  const messages: ModelMessage[] = [
    { role: 'assistant', content: null, tool_calls: [{ id: 'memory-read', type: 'function', function: {
      name: 'execute_tool', arguments: JSON.stringify({ tool: 'memory_observation_search', arguments: { query: marker } }),
    } }] },
    { role: 'tool', tool_call_id: 'memory-read', content: JSON.stringify({ status: 'success', data: saved }) },
  ];
  const pending = { id: 'proposed-external-effect', type: 'function' as const, function: {
    name: 'execute_tool', arguments: JSON.stringify({ tool: 'mail_send', arguments: { to: 'nobody@example.invalid' } }),
  } };
  let boundaries = 0;
  const first = buildMainAgentGraph({
    boundary: async () => ({ control: ++boundaries === 2 ? 'pause' : null, instructions: [] }),
    validateEvidence: current => assertCurrentMemoryMessages(owner, current),
    model: async () => { modelCalls++; return { role: 'assistant', content: null, tool_calls: [pending] }; },
    tool: async () => { toolCalls++; throw new Error('Tool must remain pending'); },
  }, saver);
  const paused = await first.invoke({ messages, pending: [], steps: 0, status: 'running', reply: '',
    seen: {}, instructionIds: [], decisionRevision: 0, policyRevision: '' }, config);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.pending.length, 1);
  assert.equal(modelCalls, 1);
  assert.equal(toolCalls, 0);
  const persisted = await first.getState(config);
  assert.equal(persisted.values.pending.length, 1, 'Pending action must survive PostgreSQL checkpointing');
  await undoMemory(owner, observationId);
  // A fresh graph object mirrors a process restart; only PostgreSQL carries its state.
  const restored = buildMainAgentGraph({
    boundary: async () => ({ control: null, instructions: [] }),
    validateEvidence: current => assertCurrentMemoryMessages(owner, current),
    model: async () => { modelCalls++; throw new Error('Model must not run after revocation'); },
    tool: async () => { toolCalls++; throw new Error('External effect must not run after revocation'); },
  }, saver);
  const checkpoint = await restored.getState(config);
  const final = await restored.invoke({ ...checkpoint.values, status: 'running', reply: '' }, config);
  assert.equal(final.status, 'partial');
  assert.equal(final.reply, MEMORY_CHANGED_REPLY);
  assert.equal(final.pending.length, 0);
  assert.equal(modelCalls, 1);
  assert.equal(toolCalls, 0);
  console.log(JSON.stringify({ isolatedClone: state.database, postgresCheckpointRestored: true,
    revokedBeforePendingTool: true, staleToolRefused: true, modelCalls, toolCalls,
    paidModelCalls: 0, externalEffects: 0 }));
} finally {
  await saver.deleteThread(thread);
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local session_replication_role=replica');
    await client.query('delete from agent_memory_conflict where owner_id=$1', [owner]);
    await client.query('delete from agent_memory_notice where owner_id=$1', [owner]);
    await client.query('delete from agent_memory_graph_outbox where observation_id in(select id from agent_memory_observation where owner_id=$1)', [owner]);
    await client.query('delete from agent_memory_observation where owner_id=$1', [owner]);
    await client.query('delete from app_user where id=$1', [owner]);
    await client.query('commit');
  } catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); await pool.end(); await getPool().end(); }
}
