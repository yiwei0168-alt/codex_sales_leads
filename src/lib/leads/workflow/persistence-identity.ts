import { createHash } from "node:crypto";
import type { WorkflowStageMetric } from "./types";

export const RESULT_PERSISTENCE_IDENTITY_VERSION = "result-input-v2";

/** Persistence retries regenerate their own timing; every business value and other metric stays significant. */
export function resultPersistenceFingerprint(input: { stageMetrics: WorkflowStageMetric[] }): string {
  return persistenceInputFingerprint({ ...input, stageMetrics: input.stageMetrics.map(metric =>
    metric.stage === "persist_results" ? { ...metric, startedAt: null, completedAt: null } : metric) });
}

/** Object key order is irrelevant; array order and every JSON value remain significant. */
export function persistenceInputFingerprint(input: unknown): string {
  const serialized = JSON.stringify(input, (_key, value: unknown) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
    }
    return value;
  });
  return createHash("sha256").update(serialized).digest("hex");
}
