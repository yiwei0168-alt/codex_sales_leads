import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { OWNER_USER_ID } from "../src/lib/auth/config";
import { getPool, tenantQuery } from "../src/lib/rag/db";
import {
  assertManifestScope,
  buildPhysicalSourceManifest,
  type RegisteredAssetBinding,
} from "../src/lib/knowledge/manifest-v3";

nextEnv.loadEnvConfig(process.cwd());
const outputFlag = process.argv.find((value) => value.startsWith("--output="));
const outputPath = outputFlag?.slice("--output=".length) ?? "tmp/knowledge-v3-manifest.json";
const shouldWrite = process.argv.includes("--write");

const rows = await tenantQuery<RegisteredAssetBinding>(OWNER_USER_ID, `
  select a.id as "assetId",a.document_id as "documentId",d.visibility,d.owner_id as "ownerId",d.title,
    a.storage_key as "storageKey",a.source_sha256 as "sourceSha256",a.byte_size::text as "byteSize",
    a.mime_type as "mimeType",a.document_type as "documentType",a.document_version as "documentVersion",
    a.market,a.language,a.source_nature as "sourceNature",a.externally_disclosable as "externallyDisclosable",
    coalesce((select jsonb_agg(jsonb_build_object(
      'entityId',e.id,'entityType',e.entity_type,'canonicalKey',e.canonical_key,
      'displayName',e.display_name,'relationType',de.relation_type) order by e.canonical_key)
      from knowledge_document_entity de join knowledge_entity e on e.id=de.entity_id
      where de.document_id=d.id),'[]'::jsonb) as entities
  from knowledge_asset a join knowledge_document d on d.id=a.document_id
  where a.registration_status='registered' and (d.visibility='shared' or d.owner_id=$1)
  order by a.storage_key,a.id
`, [OWNER_USER_ID], "admin");

const sources = buildPhysicalSourceManifest(rows);
assertManifestScope(rows, sources);
const localChecks = [];
for (const source of sources) {
  const absolute = resolve(source.storageKey);
  const metadata = await stat(absolute);
  const bytes = await readFile(absolute);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  localChecks.push({
    storageKey: source.storageKey,
    exists: metadata.isFile(),
    bytesMatch: metadata.size.toString() === source.byteSize,
    sha256Match: sha256 === source.sourceSha256,
  });
}
const invalidSources = localChecks.filter((item) => !item.exists || !item.bytesMatch || !item.sha256Match);
if (invalidSources.length) throw new Error(`Registered source mismatch: ${JSON.stringify(invalidSources)}`);

const manifest = {
  schemaVersion: "knowledge-v3-manifest-1",
  generatedAt: new Date().toISOString(),
  ownerScopeId: OWNER_USER_ID,
  registeredAssets: rows.length,
  physicalSources: sources.length,
  rowScopedSources: sources.filter((source) => source.bindingMode === "row-scoped-required").length,
  registeredBytes: rows.reduce((sum, row) => sum + BigInt(row.byteSize), BigInt(0)).toString(),
  uniquePhysicalBytes: sources.reduce((sum, source) => sum + BigInt(source.byteSize), BigInt(0)).toString(),
  sources,
  localChecks,
  externalCalls: { document: 0, model: 0, embedding: 0, search: 0, smtp: 0 },
};

if (shouldWrite) {
  const destination = resolve(outputPath);
  if (!destination.startsWith(resolve("tmp") + "\\")) throw new Error("Manifest output must remain under tmp/");
  await writeFile(destination, JSON.stringify(manifest, null, 2), "utf8");
}
console.log(JSON.stringify({ ...manifest, sources: undefined, localChecks: undefined, mode: shouldWrite ? "checkpoint-written" : "read-only" }, null, 2));
await getPool().end();
