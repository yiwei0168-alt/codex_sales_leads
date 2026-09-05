import { createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sanitizeDiscoveryCalls<T extends { callKey: string; query?: string;
  querySha256?: string; items?: unknown }>(calls: T[]) {
  return calls.map((inputCall) => {
    const { items, query, ...call } = inputCall;
    void items;
    const queryHash = typeof query === "string" ? sha256(query) : call.querySha256;
    if (!queryHash) throw new Error(`Discovery call ${inputCall.callKey} has neither query nor querySha256`);
    return { ...call, querySha256: queryHash };
  });
}
