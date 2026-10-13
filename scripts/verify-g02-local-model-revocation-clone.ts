import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import nextEnv from '@next/env';
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
const owner = randomUUID();
const marker = `G02 synthetic preference ${randomUUID()}`;
let modelCalls = 0;
let toolCalls = 0;
let observationId = '';
try {
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'G02 local fixture','!','member','active')", [owner, `${owner}@example.invalid`]);
  observationId = await observeMemory(owner, {
    kind: 'preference', memoryKey: marker, content: `${marker}: use a weekly summary.`,
    sourceReceipt: { type: 'g02-local-synthetic', id: randomUUID() },
  });
  const saved = await searchMemoryWithGraph(owner, marker, new Date().toISOString(), new Date().toISOString(), undefined, async () => [observationId]);
  assert(saved.rows.some(row => row.id === observationId), 'Synthetic memory must be readable before revocation');
  const messages: ModelMessage[] = [
    { role: 'assistant', content: null, tool_calls: [{ id: 'memory-read', type: 'function', function: {
      name: 'execute_tool', arguments: JSON.stringify({ tool: 'memory_observation_search', arguments: { query: marker } }),
    } }] },
    { role: 'tool', tool_call_id: 'memory-read', content: JSON.stringify({ status: 'success', data: saved }) },
  ];
  const graph = buildMainAgentGraph({
    boundary: async () => ({ control: null, instructions: [] }),
    validateEvidence: current => assertCurrentMemoryMessages(owner, current),
    model: async current => {
      modelCalls++;
      assert.equal(modelCalls, 1, 'Only one local model request is allowed');
      const response = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST', signal: AbortSignal.timeout(120_000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'qwen3:8b', stream: false, think: false,
          options: { temperature: 0, num_predict: 128 }, messages: [
            { role: 'system', content: 'Answer in one short sentence using the provided synthetic memory.' },
            { role: 'user', content: current.filter(message => message.role === 'tool').map(message => message.content).join('\n') },
          ] }),
      });
      assert(response.ok, `Local model HTTP ${response.status}`);
      const body = await response.json() as { message?: { content?: string } };
      const content = body.message?.content?.trim();
      if(!content)throw new Error('Local model returned no text');
      // The source changes after generation but before LangGraph can save the answer.
      await undoMemory(owner, observationId);
      return { role: 'assistant', content };
    },
    tool: async () => { toolCalls++; throw new Error('No tool should execute after revocation'); },
  });
  const final = await graph.invoke({ messages, pending: [], steps: 0, status: 'running', reply: '',
    seen: {}, instructionIds: [], decisionRevision: 0, policyRevision: '' });
  assert.equal(final.status, 'partial');
  assert.equal(final.reply, MEMORY_CHANGED_REPLY);
  assert.equal(final.messages.length, messages.length, 'Stale model answer must not enter the task transcript');
  assert.equal(toolCalls, 0);
  console.log(JSON.stringify({ isolatedClone: state.database, localModel: 'qwen3:8b', modelCalls,
    sourceRevokedBeforeSave: true, staleAnswerDiscarded: true, toolCalls, cloudCalls: 0, externalEffects: 0 }));
} finally {
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
