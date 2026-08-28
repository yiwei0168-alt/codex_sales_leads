import { randomUUID } from "node:crypto";

import nextEnv from "@next/env";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import { getPool, query } from "../src/lib/rag/db";

nextEnv.loadEnvConfig(process.cwd());

const requiredTables = ["lead_workflow_job", "lead_candidate_assessment"];
const requiredAssessmentColumns = ["fact_ledger", "dimension_rationales", "scoring_status",
  "assessment_review", "handoff_report"];
const requiredCheckpointTables = ["checkpoint_migrations", "checkpoints", "checkpoint_blobs", "checkpoint_writes"];
const [domainTables, assessmentColumns, checkpointTables, rlsRows] = await Promise.all([
  query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[])`, [requiredTables]),
  query<{ column_name: string }>(`select column_name from information_schema.columns
    where table_schema='public' and table_name='lead_candidate_assessment' and column_name=any($1::text[])`,
  [requiredAssessmentColumns]),
  query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema='langgraph' and table_name=any($1::text[])`, [requiredCheckpointTables]),
  query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
    `select relname, relrowsecurity, relforcerowsecurity from pg_class where relname=any($1::text[])`, [requiredTables]),
]);
if (domainTables.length !== requiredTables.length) throw new Error("Lead workflow domain tables are incomplete");
if (assessmentColumns.length !== requiredAssessmentColumns.length) throw new Error("Lead assessment governance columns are incomplete");
if (checkpointTables.length !== requiredCheckpointTables.length) throw new Error("LangGraph checkpoint tables are incomplete");
if (rlsRows.some((row) => !row.relrowsecurity || !row.relforcerowsecurity)) throw new Error("Lead workflow tenant tables must force RLS");

const VerificationState = Annotation.Root({ value: Annotation<number>() });
const checkpointer = new PostgresSaver(getPool(), undefined, { schema: "langgraph" });
const graph = new StateGraph(VerificationState)
  .addNode("increment", (state) => ({ value: state.value + 1 }))
  .addEdge(START, "increment")
  .addEdge("increment", END)
  .compile({ checkpointer });
const threadId = `verify:${randomUUID()}`;
try {
  const result = await graph.invoke({ value: 1 }, { configurable: { thread_id: threadId } });
  if (result.value !== 2) throw new Error("LangGraph checkpoint verification graph returned an unexpected value");
  const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
  if (snapshot.values.value !== 2) throw new Error("LangGraph checkpoint could not be read back from PostgreSQL");
  console.log(JSON.stringify({
    domainTables: domainTables.map((row) => row.table_name).sort(),
    assessmentGovernanceColumns: assessmentColumns.map((row) => row.column_name).sort(),
    checkpointTables: checkpointTables.map((row) => row.table_name).sort(),
    forcedRlsTables: rlsRows.filter((row) => row.relrowsecurity && row.relforcerowsecurity).map((row) => row.relname).sort(),
    checkpointRoundTrip: true,
  }, null, 2));
} finally {
  await checkpointer.deleteThread(threadId).catch(() => undefined);
  await checkpointer.end();
}
