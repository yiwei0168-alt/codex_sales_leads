import { createHash } from "node:crypto";

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
