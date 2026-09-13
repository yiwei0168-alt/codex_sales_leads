import nextEnv from "@next/env";
import { tenantTransaction } from "../src/lib/rag/db";
import { resolveTargetWorkspace } from "./resolve-target-workspace";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const targetWorkspace=await resolveTargetWorkspace();

const result = await tenantTransaction(targetWorkspace.ownerId, async (client) => {
  const workspace = await client.query<{ slug: string; market: string }>(
    `select slug, market from market_workspace where owner_id = $1 and status = 'active' limit 1`,
    [targetWorkspace.ownerId],
  );
  if (workspace.rows[0]?.slug !== "global-sales") throw new Error("Global workspace migration is not active");

  const created = await client.query<{ id: string }>(
    `insert into assistant_conversation (user_id, title) values ($1, 'verification') returning id`,
    [targetWorkspace.ownerId],
  );
  await client.query(
    `insert into assistant_message (user_id, conversation_id, role, intent, content)
     values ($1, $2, 'user', 'general', 'verification')`,
    [targetWorkspace.ownerId, created.rows[0].id],
  );
  const visible = await client.query<{ count: number }>(
    `select count(*)::int as count from assistant_message where conversation_id = $1`,
    [created.rows[0].id],
  );
  await client.query(`delete from assistant_conversation where id = $1`, [created.rows[0].id]);
  return { workspace: workspace.rows[0], visibleMessages: visible.rows[0].count };
});

console.log(`Assistant workspace verified: ${result.workspace.slug} / ${result.workspace.market}; tenant-visible messages: ${result.visibleMessages}`);
