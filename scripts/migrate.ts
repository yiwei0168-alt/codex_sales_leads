import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";
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
  const migrationsDirectory = join(root, "db", "migrations");
  const migrations = (await readdir(migrationsDirectory))
    .filter((file) => /^\d+.*\.sql$/i.test(file))
    .sort();
  for (const migration of migrations) {
    const sql = await readFile(join(migrationsDirectory, migration), "utf8");
    await pool.query(sql);
    console.log(`Applied db/migrations/${migration}`);
  }
} finally {
  await pool.end();
}
