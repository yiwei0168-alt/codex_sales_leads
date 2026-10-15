/** Rollback-only G15 reservation-cap acceptance in the named local PostgreSQL clone. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { Client } from "pg";

nextEnv.loadEnvConfig(process.cwd());
const state = JSON.parse(await readFile("tmp/ma11-replay-state.json", "utf8")) as {
  database: string; cleaned?: boolean;
};
assert(!state.cleaned && /^ma11_replay_[a-f0-9]{12}$/.test(state.database),
  "Active isolated clone required");
assert.equal(process.env.MA24_ADMISSION_USE_CLONE, "1", "Explicit isolated clone required");
const configured = process.env.DATABASE_MIGRATION_URL;
assert(configured, "Local migration connection required");
const url = new URL(configured);
assert(["localhost", "127.0.0.1", "::1"].includes(url.hostname), "Remote database denied");
url.pathname = `/${state.database}`;
const client = new Client({ connectionString: url.toString() });
const manifest = "a".repeat(64);
const owners = [randomUUID(), randomUUID()];
const runs = [randomUUID(), randomUUID()];
const conversations = [randomUUID(), randomUUID()];
let opened = false;
const reservation = (index: number, bytes: number, tokens: number, micros: number,
  known = true, stage = "main-agent-evaluation") => client.query(`insert into paid_call_reservation(user_id,operation_id,stage,
    tariff_key,tariff_version,reserved_micros,cost_bound_known,status,metrics)
    values($1,$2,$3,'synthetic','v1',$4,$5,'reserved',$6)`,
  [owners[index], runs[index], stage, micros, known,
    JSON.stringify({ inputBytes: bytes, maximumOutputTokens: tokens })]);
const appReservation = async (index: number, bytes: number, tokens: number,
  micros: number, stage?: string) => {
  await client.query('set local role "network_copilot_app"');
  await client.query("select set_config('app.current_user_id',$1,true)", [owners[index]]);
  await reservation(index, bytes, tokens, micros, true, stage);
  await client.query("reset role");
};
const denied = async (label: string, call: () => Promise<unknown>) => {
  await client.query("savepoint cap_case");
  try {
    await assert.rejects(call(), /MA24 evaluation/);
  } finally {
    await client.query("rollback to savepoint cap_case");
    await client.query("release savepoint cap_case");
  }
  return label;
};
await client.connect();
try {
  assert.equal((await client.query<{ current_database: string }>(
    "select current_database()")).rows[0]?.current_database, state.database);
  await client.query("begin"); opened = true;
  await client.query(await readFile("db/migrations/139_ma24_evaluation_hard_limits.sql", "utf8"));
  const canInsert = (await client.query<{ allowed: boolean }>(
    "select has_table_privilege('network_copilot_app','ma24_evaluation_hard_limit','INSERT') as allowed"))
    .rows[0]?.allowed;
  assert.equal(canInsert, false, "Application role can provision a cap");
  for (let i = 0; i < 2; i++) {
    await client.query(`insert into app_user(id,email,display_name,role,status)
      values($1,$2,'MA24 hard-limit synthetic fixture','member','active')`,
    [owners[i], `${owners[i]}@example.invalid`]);
    await client.query(`insert into assistant_conversation(id,user_id,title,status)
      values($1,$2,'MA24 hard-limit fixture','deleted')`, [conversations[i], owners[i]]);
    await client.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,
      input,model_config,execution_kind,execution_spec,status,lease_token,lease_until)
      values($1,$2,$3,$4,$5,'{}','{}','main-agent-evaluation',$6,'running',$7,now()+interval '1 hour')`,
    [runs[i], owners[i], conversations[i], runs[i], "b".repeat(64),
      JSON.stringify({ schema: "ma24-evaluation-run-v1", manifestSha256: manifest,
        caseId: `synthetic-${i}`, arm: i === 0 ? "baseline" : "candidate" }), randomUUID()]);
  }
  const checks: string[] = [];
  checks.push(await denied("missing-cap-rejected", () => appReservation(0, 10, 5, 60)));
  await client.query(`insert into ma24_evaluation_hard_limit(manifest_sha256,
    maximum_provider_requests,maximum_request_bytes,maximum_output_tokens,
    hard_spend_cap_micros,authorized_at,authorization_reference)
    values($1,2,20,10,100,now(),'synthetic-clone-only')`, [manifest]);
  await appReservation(0, 10, 5, 60);
  await appReservation(1, 10, 5, 40, "knowledge-search");
  const used = (await client.query<{ used_provider_requests: string;
    used_request_bytes: string; used_output_tokens: string; used_reserved_micros: string }>(
    `select used_provider_requests::text,used_request_bytes::text,
      used_output_tokens::text,used_reserved_micros::text
      from ma24_evaluation_hard_limit where manifest_sha256=$1`, [manifest])).rows[0];
  assert.deepEqual(used, { used_provider_requests: "2", used_request_bytes: "20",
    used_output_tokens: "10", used_reserved_micros: "100" });
  checks.push("two-accounts-share-four-caps");
  checks.push(await denied("request-count-rejected", () => reservation(0, 1, 1, 1)));
  await client.query(`update ma24_evaluation_hard_limit set used_provider_requests=0,
    used_request_bytes=0,used_output_tokens=0,used_reserved_micros=0,
    maximum_provider_requests=10 where manifest_sha256=$1`, [manifest]);
  checks.push(await denied("bytes-rejected", () => reservation(0, 21, 1, 1)));
  checks.push(await denied("tokens-rejected", () => reservation(0, 1, 11, 1)));
  checks.push(await denied("spend-rejected", () => reservation(0, 1, 1, 101)));
  checks.push(await denied("unknown-cost-rejected", () => reservation(0, 1, 1, 1, false)));
  await client.query("update agent_run set status='failed' where id=$1", [runs[0]]);
  checks.push(await denied("inactive-run-rejected", () => reservation(0, 1, 1, 1)));
  const after = (await client.query<{ count: string }>(
    "select count(*)::text as count from paid_call_reservation where operation_id=any($1::text[])",
    [runs])).rows[0]?.count;
  assert.equal(after, "2", "Failed admissions inserted reservations");
  await client.query("rollback"); opened = false;
  const remains = (await client.query<{ limit_table: string | null; owners: string }>(
    `select to_regclass('public.ma24_evaluation_hard_limit')::text as limit_table,
      (select count(*)::text from app_user where id=any($1::uuid[])) as owners`, [owners])).rows[0];
  assert.deepEqual(remains, { limit_table: null, owners: "0" },
    "Clone transaction did not roll back");
  console.log(JSON.stringify({ schema: "ma24-g15-hard-limits-clone-v1",
    clone: state.database, checks, rollbackVerified: true, providerCalls: 0 }));
} finally {
  if (opened) await client.query("rollback");
  await client.end();
}
