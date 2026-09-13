import { createHash } from "node:crypto";
import { tenantQuery } from "@/lib/rag/db";
import type { DiscoverySessionSnapshot } from "./discovery-session";
import type { HybridDiscoveryRoundCheckpoint } from "./hybrid-discovery-executor";

export interface StoredDiscoveryCheckpoint {
  version: "discovery-call-checkpoint-v1";
  contract: string;
  session: DiscoverySessionSnapshot;
  round: HybridDiscoveryRoundCheckpoint;
}
export interface DiscoveryCheckpointOwner {
  userId: string; workspaceId: string; runId: string; countryCode: string; actionId: string; graphThreadId: string;
}
export function discoveryRoundContract(dependency: string, playbook: unknown, round: number, targetPool: number | undefined): string {
  return createHash("sha256").update(JSON.stringify({ dependency, playbook, round, targetPool })).digest("hex");
}
const ownership = `id=$1 and workspace_id=$2 and country_code=$3
  and metadata->>'assistantActionId'=$4 and metadata->>'graphThreadId'=$5
  and exists(select 1 from market_workspace where id=$2 and owner_id=$6)`;
function args(owner: DiscoveryCheckpointOwner) {
  return [owner.runId, owner.workspaceId, owner.countryCode, owner.actionId, owner.graphThreadId, owner.userId];
}
export async function loadDiscoveryCheckpoint(owner: DiscoveryCheckpointOwner, contract: string, round: number) {
  const rows = await tenantQuery<{ saved: StoredDiscoveryCheckpoint | null }>(owner.userId,
    `select metadata->'discoveryCheckpoint' as saved from lead_search_run where ${ownership}`, args(owner));
  if (rows.length !== 1) throw new Error("Discovery checkpoint ownership mismatch");
  const saved = rows[0].saved;
  if (!saved) return undefined;
  if (saved.version !== "discovery-call-checkpoint-v1" || !Number.isSafeInteger(saved.round?.round)) throw new Error("Invalid discovery checkpoint");
  if (saved.round.round < round) return undefined;
  if (saved.round.round !== round || saved.contract !== contract) throw new Error("Discovery checkpoint request contract mismatch");
  return saved;
}
export async function saveDiscoveryCheckpoint(owner: DiscoveryCheckpointOwner, saved: StoredDiscoveryCheckpoint) {
  const rows = await tenantQuery(owner.userId,
    `update lead_search_run set metadata=metadata || jsonb_build_object('discoveryCheckpoint',$7::jsonb)
      where ${ownership} returning id`, [...args(owner), JSON.stringify(saved)]);
  if (rows.length !== 1) throw new Error("Discovery checkpoint ownership mismatch");
}
