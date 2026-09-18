export type ExactChunkEntity = { entityId: string; canonicalKey: string; displayName: string };

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function findExactModelEntities(text: string, entities: ExactChunkEntity[]): string[] {
  const normalized = text.normalize("NFKC");
  const matched = new Set<string>();
  for (const entity of entities) {
    const names = new Set([entity.canonicalKey, entity.displayName]);
    for (const name of names) {
      const exact = escapeRegExp(name.normalize("NFKC").trim()).replace(/\\ /g, "\\s+");
      if (!exact) continue;
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${exact}(?![\\p{L}\\p{N}])`, "iu");
      if (pattern.test(normalized)) {
        matched.add(entity.entityId);
        break;
      }
    }
  }
  return [...matched];
}
