import { createHash } from "node:crypto";

interface CacheEntry<T> { value: T; expiresAt: number }
const values = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export function knowledgeCacheKey(namespace: string, input: unknown): string {
  return `${namespace}:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
}

export async function withSuccessfulKnowledgeCache<T>(options: {
  key: string;
  ttlMs: number;
  load: () => Promise<T>;
  shouldCache?: (value: T) => boolean;
}): Promise<{ value: T; cacheHit: boolean }> {
  const existing = values.get(options.key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > Date.now()) return { value: existing.value, cacheHit: true };
  if (existing) values.delete(options.key);
  const pending = inFlight.get(options.key) as Promise<T> | undefined;
  if (pending) return { value: await pending, cacheHit: true };
  const promise = options.load();
  inFlight.set(options.key, promise);
  try {
    const value = await promise;
    if (options.shouldCache?.(value) ?? true) values.set(options.key, { value, expiresAt: Date.now() + options.ttlMs });
    return { value, cacheHit: false };
  } finally {
    inFlight.delete(options.key);
  }
}

export function clearKnowledgeCache(): void {
  values.clear();
  inFlight.clear();
}
