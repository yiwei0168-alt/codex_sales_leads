import { readCurrentCnyFxReference, refreshBillingFxReference } from "./fx-reference-repository";

/** Both inline and worker callers share the same daily refresh lock and hourly failure backoff. */
export async function readFreshCnyFxReference(now=Date.now(),dependencies={
  refresh:()=>refreshBillingFxReference(fetch,now),
  read:()=>readCurrentCnyFxReference(now),
}) {
  // A refresh outage does not invalidate an independently validated, still-current snapshot.
  try { await dependencies.refresh(); } catch { /* Cached reference keeps its original dates. */ }
  return dependencies.read();
}
