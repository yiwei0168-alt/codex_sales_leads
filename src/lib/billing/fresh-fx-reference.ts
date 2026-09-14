import { readCurrentCnyFxReference, refreshBillingFxReference } from "./fx-reference-repository";
import {currentSpendContext} from "./context";

/** Both inline and worker callers share the weekly refresh lock and hourly failure backoff. */
export async function readFreshCnyFxReference(now=Date.now(),dependencies={
  refresh:()=>refreshBillingFxReference(fetch,now),
  read:()=>readCurrentCnyFxReference(now),
}) {
  // A local acceptance scope pins one already stored official version and never refreshes it.
  if(currentSpendContext()?.fixedFxReferenceVersion)return dependencies.read();
  // A refresh outage does not invalidate an independently validated, still-current snapshot.
  try { await dependencies.refresh(); } catch { /* Cached reference keeps its original dates. */ }
  return dependencies.read();
}
