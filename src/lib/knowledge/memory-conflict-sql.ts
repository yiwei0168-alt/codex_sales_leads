/** Shared by bitemporal readers: $1 owner, $2 known-at, $3 business-at, m observation.
 * Keep both sides out of ordinary recall while their conflict is effective at those clocks.
 * Later conflicts or invalidations must not rewrite an earlier knowledge snapshot.
 */
export const memoryConflictExclusionSql=`
  and not exists (
    select 1 from agent_memory_conflict c
    join agent_memory_observation a on a.id=c.earlier_id and a.owner_id=c.owner_id
    join agent_memory_observation b on b.id=c.later_id and b.owner_id=c.owner_id
    where c.owner_id=$1 and (c.earlier_id=m.id or c.later_id=m.id)
      and c.created_at<=$2::timestamptz and (c.resolved_at is null or c.resolved_at>$2::timestamptz)
      and a.recorded_at<=$2::timestamptz and b.recorded_at<=$2::timestamptz
      and (a.valid_from is null or a.valid_from<=$3::timestamptz)
      and (b.valid_from is null or b.valid_from<=$3::timestamptz)
      and (a.valid_until is null or a.valid_until>$3::timestamptz)
      and (b.valid_until is null or b.valid_until>$3::timestamptz)
      and not exists(select 1 from agent_memory_observation r where r.owner_id=$1
        and r.recorded_at<=$2::timestamptz
        and (r.corrects_id in(a.id,b.id) or r.invalidates_id in(a.id,b.id)))
  )`;
