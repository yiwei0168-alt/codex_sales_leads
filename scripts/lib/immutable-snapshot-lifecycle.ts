import type {PoolClient} from 'pg';
import {z} from 'zod';

export const snapshotPrunePlanSchema=z.object({protocol:z.literal('orphan-asset-snapshot-prune-v1'),before:z.iso.datetime(),
 snapshots:z.array(z.object({snapshotId:z.uuid(),assetId:z.uuid(),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),byteSize:z.string().regex(/^(?:0|[1-9][0-9]*)$/)}).strict()).min(1).max(100),
}).strict().superRefine((plan,ctx)=>{
 if(new Set(plan.snapshots.map(row=>row.snapshotId)).size!==plan.snapshots.length)ctx.addIssue({code:'custom',message:'Duplicate snapshot IDs'});
});
type SnapshotClient=Pick<PoolClient,'query'>;
async function assertSnapshotOperator(client:SnapshotClient){
 const row=(await client.query<{allowed:boolean;now:Date}>(`select current_user=pg_get_userbyid(c.relowner) and (r.rolsuper or r.rolbypassrls) as allowed,
 clock_timestamp() as now from pg_class c join pg_roles r on r.rolname=current_user where c.oid='public.knowledge_asset_immutable_snapshot'::regclass`)).rows[0];
 if(!row?.allowed)throw new Error('Snapshot operations owner with RLS bypass required');return row.now;
}
/** Read-only preview. Existing metadata protects snapshots even when archived,
 * withdrawn, private, or hash-revised; only a missing asset is an orphan. */
export async function previewOrphanAssetSnapshots(client:SnapshotClient,before:string,limit:number){
 z.iso.datetime().parse(before);z.number().int().min(1).max(100).parse(limit);
 const now=await assertSnapshotOperator(client);if(Date.parse(before)>now.getTime())throw new Error('Snapshot cleanup cutoff must not be in the future');
 const rows=(await client.query<{snapshotId:string;assetId:string;sourceSha256:string;byteSize:string}>(`select s.id as "snapshotId",s.asset_id as "assetId",s.source_sha256 as "sourceSha256",s.byte_size::text as "byteSize"
 from public.knowledge_asset_immutable_snapshot s where s.created_at<$1::timestamptz and $1::timestamptz<=clock_timestamp()
 and not exists(select 1 from public.knowledge_asset a where a.id=s.asset_id) order by s.created_at,s.id limit $2`,[before,limit])).rows;
 return {protocol:'orphan-asset-snapshot-prune-v1' as const,before,snapshots:rows};
}
/** The SQL function enforces stable locks, exact sources and request-id replay.
 * COMMIT belongs to the operator caller; a result alone is not a commit receipt. */
export async function pruneOrphanAssetSnapshots(client:SnapshotClient,requestId:string,input:unknown,reason:string){
 z.uuid().parse(requestId);z.string().trim().min(1).max(1000).parse(reason);const plan=snapshotPrunePlanSchema.parse(input);
 await assertSnapshotOperator(client);
 const result=(await client.query<{manifest_hash:string;deleted_count:number;deleted_bytes:string;completed_at:Date}>(
  'select * from public.prune_orphan_asset_snapshots($1,$2,$3)',[requestId,plan,reason])).rows[0];
 if(!result||result.deleted_count!==plan.snapshots.length)throw new Error('Snapshot cleanup receipt unavailable');
 return {requestId,manifestHash:result.manifest_hash,deletedCount:result.deleted_count,deletedBytes:result.deleted_bytes,completedAt:result.completed_at.toISOString()};
}
