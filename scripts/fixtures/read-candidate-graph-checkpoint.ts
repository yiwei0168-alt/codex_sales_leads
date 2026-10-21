import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {PostgresSaver} from '@langchain/langgraph-checkpoint-postgres';

/** Disposable-fixture administrator readback. Production uses the collector's
 * lease-fenced adapter. Retain the exact owner/evaluation/arm/source binding and
 * reconstruct channel blobs using the installed saver, never legacy payloads. */
export async function readCandidateGraphCheckpoint(pool:Pool,pin:{owner:string;evaluationId:string;arm:'baseline'|'candidate'}){
 const binding=(await pool.query<{snapshot_hash:string;payload:unknown}>(`select snapshot_hash,payload
  from agent_skill_candidate_checkpoint where owner_id=$1 and evaluation_id=$2 and arm=$3`,
 [pin.owner,pin.evaluationId,pin.arm])).rows[0];
 assert(binding,'Candidate graph binding missing');assert.match(binding.snapshot_hash,/^[a-f0-9]{64}$/);
 assert.equal(binding.payload,null,'Formal graph must not also publish a legacy sidecar payload');
 const thread=`skill-candidate:${pin.owner}:${pin.evaluationId}:${pin.arm}:${binding.snapshot_hash}`;
 const tuple=await new PostgresSaver(pool,undefined,{schema:'skill_candidate_graph'})
  .getTuple({configurable:{thread_id:thread,checkpoint_ns:''}});
 assert(tuple,'Bound candidate graph checkpoint missing');assert.equal(tuple.config.configurable?.thread_id,thread);
 return tuple;
}
