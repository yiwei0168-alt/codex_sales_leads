import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Client } from "pg";

export const MA24_STAGE_127_135 = [
  ["127_upload_extraction_reviews.sql", "83dc4567b2079c03b7d44cee68691f2a7edccc25604720c93f1eee695dfade45"],
  ["128_upload_extraction_review_completion.sql", "407faa5a9d68ed6bcc2b2665bee5570e67138532d7a128bdd131c747600377fa"],
  ["129_upload_visual_queue.sql", "fb8a9bd1f382fec06f5ae1515fb65ce7e61ed599be00c31a0c8a82ec6211bbc3"],
  ["130_skill_acceptance_evidence.sql", "8584db80f8085cd179e7b15fd6585785e0922746d17e1053ebb085469c7b8fce"],
  ["131_skill_model_attempt_journal.sql", "ebd091f77b7ff60e5cfc601d77542ea9859791a2f5c93ea2d2bd670c72e10274"],
  ["132_skill_bundle_collector.sql", "677f3cae793aef426c643ec4f73464ea5fdd5051289260fad10e55b563e04b4d"],
  ["133_skill_acceptance_freeze.sql", "7b50d0490514384c37321fd7d49f4b61d53e944eb28a8431f257101974667b29"],
  ["134_skill_model_freeze_binding.sql", "e8ef22ecc55b5a7cadd75241c851a4a0fb133526d6d275434fd5c472bb5f310d"],
  ["135_skill_freeze_current_version.sql", "870bf9ebcc07cbb6508a8a19e2a0188ec2b9dc9528ca203eae55dce6fea4051e"],
] as const;

export async function verifiedMa24StageSql(root = process.cwd()): Promise<Array<{ name: string; sha256: string; sql: string }>> {
  return Promise.all(MA24_STAGE_127_135.map(async ([name, sha256]) => {
    const sql = await readFile(resolve(root, "db", "migrations", name), "utf8");
    assert.equal(createHash("sha256").update(sql).digest("hex"), sha256, `Migration hash changed: ${name}`);
    return { name, sha256, sql };
  }));
}

export async function applyVerifiedMa24Stage(client: Client, files: Awaited<ReturnType<typeof verifiedMa24StageSql>>): Promise<void> {
  for (const file of files) await client.query(file.sql);
}

export async function ma24StageMarkers(client: Client): Promise<Record<string, boolean>> {
  const row = (await client.query<Record<string, boolean>>(`select
    to_regclass('public.knowledge_upload_extraction_review') is not null as extraction_review,
    to_regclass('public.knowledge_upload_review_completion') is not null as review_completion,
    to_regclass('public.agent_skill_acceptance_bundle') is not null as acceptance_bundle,
    to_regclass('public.agent_skill_model_attempt') is not null as model_attempt,
    to_regclass('public.agent_skill_acceptance_freeze') is not null as acceptance_freeze,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='knowledge_upload_job' and column_name='visual_retry_at') as visual_retry,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='agent_skill_model_attempt' and column_name='freeze_id') as model_freeze_binding,
    case when to_regrole('network_copilot_skill_collector') is null then false else
      has_table_privilege('network_copilot_skill_collector','public.agent_skill','SELECT') and
      has_table_privilege('network_copilot_skill_collector','public.agent_skill_version','SELECT') and
      has_table_privilege('network_copilot_skill_collector','public.agent_run_skill','SELECT') end as skill_freeze_reader`)).rows[0];
  return row;
}
