import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import nextEnv from "@next/env";
import { Client } from "pg";

nextEnv.loadEnvConfig(process.cwd());
const configured = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
assert(configured, "A local PostgreSQL connection is required");
const url = new URL(configured);
assert(["localhost", "127.0.0.1", "::1"].includes(url.hostname), "Remote database is not allowed");
assert.equal(decodeURIComponent(url.pathname.slice(1)), "network_copilot_local", "Unexpected product database");
const apply = process.argv.includes("--apply");
const client = new Client({ connectionString: url.toString() });
await client.connect();
let open = false;
try {
  await client.query("begin");
  open = true;
  const changes = (await client.query(`select distinct b.user_id from spend_budget_change b
    left join app_user u on u.id=b.user_id where u.id is null`)).rows as Array<{ user_id: string }>;
  const budgets = (await client.query(`select distinct b.user_id from user_spend_budget b
    left join app_user u on u.id=b.user_id where u.id is null`)).rows as Array<{ user_id: string }>;
  assert.equal(changes.length, 1, "Expected exactly one orphaned change owner");
  assert.equal(budgets.length, 1, "Expected exactly one orphaned budget owner");
  assert.equal(changes[0].user_id, budgets[0].user_id, "Budget and change owners differ");
  const id = changes[0].user_id;
  const idSha256 = createHash("sha256").update(id).digest("hex");
  if (apply) {
    await client.query(`insert into app_user(id,email,display_name,password_hash,role,status)
      values($1,$2,'Historical ledger owner (disabled)',null,'member','disabled')`,
      [id, `historical-ledger-${id}@example.invalid`]);
    const remaining = await client.query(`select
      (select count(*)::int from spend_budget_change b left join app_user u on u.id=b.user_id where u.id is null) as changes,
      (select count(*)::int from user_spend_budget b left join app_user u on u.id=b.user_id where u.id is null) as budgets`);
    assert.deepEqual(remaining.rows[0], { changes: 0, budgets: 0 });
    await client.query("commit");
    open = false;
  } else {
    await client.query("rollback");
    open = false;
  }
  console.log(JSON.stringify({ database: "network_copilot_local", ownerIdSha256: idSha256,
    orphanedChangeOwners: changes.length, orphanedBudgetOwners: budgets.length,
    action: apply ? "inserted-disabled-nonlogin-tombstone" : "dry-run", ledgerRowsDeleted: 0 }));
} finally {
  if (open) await client.query("rollback");
  await client.end();
}
