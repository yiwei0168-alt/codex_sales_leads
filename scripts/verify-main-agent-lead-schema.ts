import nextEnv from "@next/env";
import { query, getPool } from "../src/lib/rag/db";

nextEnv.loadEnvConfig(process.cwd());
try {
  const columns = await query<{ column_name: string }>(`select column_name from information_schema.columns
    where table_schema='public' and table_name='assistant_action' and column_name='source_agent_call_id'`);
  const indexes = await query<{ indexname: string; indexdef: string }>(`select indexname,indexdef from pg_indexes
    where schemaname='public' and tablename='assistant_action' and indexname='assistant_action_agent_call_once'`);
  if (columns.length !== 1 || indexes.length !== 1 || !indexes[0].indexdef.includes("UNIQUE")) throw new Error("Agent lead-action identity migration missing");
  console.log(JSON.stringify({ column: columns[0].column_name, uniqueIndex: indexes[0].indexname, readOnly: true }));
} finally { await getPool().end(); }
