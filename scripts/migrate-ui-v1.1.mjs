import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());
const application = process.env.DATABASE_URL;
const target = process.env.DATABASE_MIGRATION_URL || application;
if (!target || !application) throw new Error("Database configuration missing");
const a = new URL(application), b = new URL(target);
if (a.hostname !== b.hostname || a.pathname !== b.pathname || (a.port || "5432") !== (b.port || "5432")) {
  throw new Error("Migration target differs from application database");
}
const { databaseConnectionString, databaseSslConfiguration } = await import("../src/lib/rag/database-ssl.ts");
const pool = new pg.Pool({ connectionString: databaseConnectionString(target), ssl: databaseSslConfiguration(target) });
const client = await pool.connect();
try {
  await client.query("begin");
  await client.query(await readFile("db/migrations/036_company_user_overrides.sql", "utf8"));
  await client.query(await readFile("db/migrations/037_user_channel_relationship.sql", "utf8"));
  await client.query(await readFile("db/migrations/038_outbound_mail.sql", "utf8"));
  await client.query(await readFile("db/migrations/039_memory_audit.sql", "utf8"));
  await client.query(await readFile("db/migrations/040_contact_lookup_cache.sql", "utf8"));
  await client.query(await readFile("db/migrations/041_workflow_pause.sql", "utf8"));
  await client.query("commit");
  console.log("Applied UI v1.1 migrations (036–041).");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally { client.release(); await pool.end(); }
