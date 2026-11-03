import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, win32 } from "node:path";

/** A server-owned filesystem location; storage keys in the database stay portable. */
export function knowledgeStorageRoot(): string {
  const configured = process.env.KNOWLEDGE_STORAGE_ROOT?.trim();
  if (configured && !isAbsolute(configured)) throw new Error("Knowledge storage root must be absolute");
  const root = configured || resolve("knowledge");
  // Originals are runtime storage and must never be traced into application assets.
  return existsSync(/* turbopackIgnore: true */ root) ? realpathSync(/* turbopackIgnore: true */ root) : root;
}

export function safeKnowledgeStorageKey(storageKey: string): string {
  const normalized = storageKey.replaceAll("\\", "/");
  if (!normalized.startsWith("knowledge/") || isAbsolute(storageKey) || win32.isAbsolute(storageKey)
    || normalized.split("/").some(part => !part || part === "." || part === ".." || /[:\x00]/.test(part))) {
    throw new Error("Invalid knowledge asset storage key");
  }
  return normalized;
}

export function assertResolvedInsideKnowledgeRoot(path: string): void {
  const suffix = relative(knowledgeStorageRoot(), path);
  if (suffix === ".." || suffix.startsWith("../") || suffix.startsWith("..\\") || isAbsolute(suffix)) {
    throw new Error("Knowledge asset escaped storage root");
  }
}

export function resolveKnowledgeStoragePath(storageKey: string): string {
  const root = knowledgeStorageRoot();
  const requested = resolve(root, safeKnowledgeStorageKey(storageKey).slice("knowledge/".length));
  assertResolvedInsideKnowledgeRoot(requested);
  // Check the closest existing ancestor for both reads and new output files.
  // Readers still revalidate the opened file identity and expected digest.
  if (existsSync(/* turbopackIgnore: true */ root)) {
    let ancestor = requested;
    while (!existsSync(/* turbopackIgnore: true */ ancestor) && ancestor !== root) ancestor = dirname(ancestor);
    assertResolvedInsideKnowledgeRoot(realpathSync(/* turbopackIgnore: true */ ancestor));
  }
  return requested;
}

export function knowledgeExtractorScript(name: "knowledge_extraction_v2.py" | "extract-uploaded-knowledge.py"): string {
  const configured = process.env.KNOWLEDGE_SCRIPTS_ROOT?.trim();
  if (configured && !isAbsolute(configured)) throw new Error("Knowledge scripts root must be absolute");
  return resolve(configured || resolve("scripts"), name);
}
