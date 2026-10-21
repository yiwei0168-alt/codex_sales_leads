import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import {
  databaseConnectionString,
  databaseSslConfiguration,
} from "../src/lib/rag/database-ssl";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { loadEnvConfig } = nextEnv;
loadEnvConfig(root);

const applicationDatabaseUrl = process.env.DATABASE_URL;
const databaseUrl = process.env.DATABASE_MIGRATION_URL || applicationDatabaseUrl;
if (!databaseUrl) throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL is required. Copy .env.example to .env.local first.");
const args = process.argv.slice(2);
if (args.length>1||args.some(arg => !["--fresh-pilot-through=135","--fresh-pilot-through=153","--fresh-pilot-through=154","--fresh-pilot-through=155","--fresh-pilot-through=156","--fresh-pilot-through=157","--fresh-pilot-through=158","--fresh-pilot-through=159","--fresh-pilot-through=161","--fresh-pilot-through=162","--fresh-pilot-through=163","--fresh-pilot-through=164","--fresh-pilot-through=165","--fresh-pilot-through=166","--fresh-pilot-through=167","--fresh-pilot-through=168","--fresh-pilot-through=169","--fresh-pilot-through=170"].includes(arg))) throw new Error("Unknown migration argument");
const freshPilot = args.length===1;
const freshPilotThrough = args.length?Number(args[0].split('=')[1]):135;
if (freshPilot && (!process.env.DATABASE_MIGRATION_URL || !applicationDatabaseUrl)) {
  throw new Error("Fresh pilot migration requires separate application and migration database URLs");
}
if (process.env.DATABASE_MIGRATION_URL && applicationDatabaseUrl) {
  const migrationTarget = new URL(process.env.DATABASE_MIGRATION_URL);
  const applicationTarget = new URL(applicationDatabaseUrl);
  const sameTarget = migrationTarget.hostname === applicationTarget.hostname
    && (migrationTarget.port || "5432") === (applicationTarget.port || "5432")
    && migrationTarget.pathname === applicationTarget.pathname;
  if (!sameTarget) {
    throw new Error("DATABASE_MIGRATION_URL must target the same host, port, and database as DATABASE_URL");
  }
}

const pool = new Pool({
  connectionString: databaseConnectionString(databaseUrl),
  ssl: databaseSslConfiguration(databaseUrl),
});
try {
  if (freshPilot) {
    const existing = await pool.query<{ count: number }>(`
      select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','public_evidence','langgraph')
        and c.relkind in ('r','p','v','m','S','f')
        and c.relname not in ('spatial_ref_sys')`);
    if (existing.rows[0]?.count !== 0) throw new Error("Fresh pilot migration requires empty application schemas");
    if (new URL(databaseUrl).username === new URL(applicationDatabaseUrl!).username) {
      throw new Error("Fresh pilot migration requires distinct migration and application logins");
    }
  }
  const migrationsDirectory = join(root, "db", "migrations");
  const migrations = (await readdir(migrationsDirectory))
    .filter((file) => /^\d+.*\.sql$/i.test(file))
    .filter((file) => !freshPilot || Number(file.slice(0, 3)) <= freshPilotThrough)
    .sort();
  for (const migration of migrations) {
    const sql = await readFile(join(migrationsDirectory, migration), "utf8");
    await pool.query(sql);
    console.log(`Applied db/migrations/${migration}`);
  }
  await pool.query("create schema if not exists langgraph");
  const checkpointer = new PostgresSaver(pool, undefined, { schema: "langgraph" });
  await checkpointer.setup();
  const applicationRole = process.env.DATABASE_APPLICATION_ROLE?.trim() || "network_copilot_app";
  if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(applicationRole)) throw new Error("DATABASE_APPLICATION_ROLE format is invalid");
  const applicationLogin = applicationDatabaseUrl ? decodeURIComponent(new URL(applicationDatabaseUrl).username) : "";
  if (applicationLogin && !/^[a-z_][a-z0-9_.-]{0,62}$/i.test(applicationLogin)) {
    throw new Error("DATABASE_URL login role format is invalid");
  }
  for (const role of [...new Set([applicationRole, applicationLogin].filter(Boolean))]) {
    await pool.query(`grant usage on schema langgraph to "${role}"`);
    await pool.query(`grant select, insert, update, delete on all tables in schema langgraph to "${role}"`);
    await pool.query(`alter default privileges in schema langgraph grant select, insert, update, delete on tables to "${role}"`);
  }
  console.log("Applied LangGraph PostgreSQL checkpoint migrations");
} finally {
  await pool.end();
}
