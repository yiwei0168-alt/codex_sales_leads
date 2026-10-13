import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import nextEnv from '@next/env';
import { Pool } from 'pg';

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!base || !['localhost', '127.0.0.1', '::1'].includes(new URL(base).hostname))
  throw new Error('Local PostgreSQL required');
const state = JSON.parse(await readFile('tmp/ma11-replay-state.json', 'utf8')) as { database: string };
if (!/^ma11_replay_[a-f0-9]{12}$/.test(state.database)) throw new Error('Isolated clone required');
const clone = new URL(base); clone.pathname = `/${state.database}`;
const pool = new Pool({ connectionString: clone.toString() });

async function migrate() {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/run-tsx.cjs', 'scripts/migrate.ts'], {
      cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DATABASE_URL: clone.toString(), DATABASE_MIGRATION_URL: clone.toString() }
    });
    let output = '', errors = '';
    child.stdout.on('data', chunk => { output += String(chunk); });
    child.stderr.on('data', chunk => { errors += String(chunk); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(output) : reject(new Error(errors.slice(-2400) || `migration exit ${code}`)));
  });
}

try {
  const current = await pool.query<{ database: string }>('select current_database() as database');
  assert.equal(current.rows[0]?.database, state.database);
  const first = await migrate();
  const second = await migrate();
  assert(first.includes('Applied LangGraph PostgreSQL checkpoint migrations'));
  assert(second.includes('Applied LangGraph PostgreSQL checkpoint migrations'));
  const { rows } = await pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; owned_read: boolean; owned_insert: boolean; may_update: boolean; may_delete: boolean }>(`
    select c.relname,c.relrowsecurity,c.relforcerowsecurity,
      exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polname='owned_read') as owned_read,
      exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polname='owned_insert') as owned_insert,
      has_table_privilege('network_copilot_app',c.oid,'UPDATE') as may_update,
      has_table_privilege('network_copilot_app',c.oid,'DELETE') as may_delete
    from pg_class c where c.relname=any($1::text[]) order by c.relname`, [[
      'agent_skill_blind_round', 'agent_skill_blind_judgment', 'agent_skill_blind_disclosure',
      'knowledge_upload_extraction_review', 'knowledge_upload_review_completion'
    ]]);
  assert.equal(rows.length, 5);
  assert(rows.every(row => row.relrowsecurity && row.relforcerowsecurity && row.owned_read && row.owned_insert
    && !row.may_update && !row.may_delete));
  const policies = await pool.query<{ tablename: string; policyname: string; qual: string | null; with_check: string | null }>(`
    select tablename,policyname,qual,with_check from pg_policies
    where tablename=any($1::text[]) and policyname in('owned_read','owned_insert')`, [rows.map(row => row.relname)]);
  assert.equal(policies.rowCount, 10);
  assert(policies.rows.every(policy => {
    const expression = policy.policyname === 'owned_read' ? policy.qual : policy.with_check;
    return expression !== null && /owner_id\s*=\s*app_current_user_id\(\)/.test(expression);
  }));
  for (const table of ['agent_skill_blind_judgment', 'knowledge_upload_extraction_review']) {
    const insert = policies.rows.find(policy => policy.tablename === table && policy.policyname === 'owned_insert');
    assert(insert?.with_check && /reviewer_id\s*=\s*app_current_user_id\(\)/.test(insert.with_check));
  }
  console.log(JSON.stringify({ isolatedClone: state.database, consecutiveMigrationRuns: 2,
    forceRlsTables: rows.length, scopedPolicies: policies.rowCount, noAppUpdateOrDelete: true,
    externalCalls: 0 }));
} finally {
  await pool.end();
}
