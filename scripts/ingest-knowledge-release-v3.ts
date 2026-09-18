import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { OWNER_USER_ID } from "../src/lib/auth/config";
import { getPool, tenantQuery, tenantTransaction } from "../src/lib/rag/db";
import type { PhysicalSourceManifest, RegisteredAssetBinding } from "../src/lib/knowledge/manifest-v3";
import { buildRowScopedSpreadsheetChunks, type SpreadsheetArtifactRow } from "../src/lib/knowledge/spreadsheet-row-binding-v3";
import { deriveReleaseAssetState } from "../src/lib/knowledge/release-ingest-state-v3";

nextEnv.loadEnvConfig(process.cwd());
const write = process.argv.includes("--write");
const releaseKey = process.argv.find((value) => value.startsWith("--release="))?.slice(10) ?? "rag-v3-shadow-2026-09-18";
if (!/^[a-z0-9][a-z0-9._-]{2,100}$/.test(releaseKey)) throw new Error("Invalid release key");

type ArtifactUnit = {
  unitType: "page" | "slide" | "sheet" | "document";
  unitIndex: number;
  status: "success" | "blank" | "review-required" | "failed";
  contentSha256: string | null;
  reviewReason?: string | null;
  visualContentRatio?: number | null;
  humanReviewDecision?: "accept-candidate" | "decorative-no-body";
  reviewedAt?: string;
  textLength: number;
};
type ArtifactChunk = {
  index: number; headingPath: string[]; unitType: ArtifactUnit["unitType"]; unitIndex: number;
  content: string; canonicalEmbeddingText: string; tokenEstimate: number; contentSha256: string;
  evidenceStatus?: "parsed" | "candidate";
};
type Artifact = {
  extractorVersion: string; profileKey: string; sourceSha256: string; conversionStatus: string;
  units: ArtifactUnit[]; chunks: ArtifactChunk[]; spreadsheetRows?: SpreadsheetArtifactRow[]; metrics: Record<string, unknown>;
};
type Manifest = { registeredAssets: number; physicalSources: number; sources: PhysicalSourceManifest[] };
type BuiltChunk = ArtifactChunk & {
  blockType: string;
  rowStart?: number;
  rowEnd?: number;
  sheetName?: string;
  entityIds?: string[];
  bindingMethod?: string;
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
function buildSpreadsheetChunks(artifact: Artifact, binding: RegisteredAssetBinding): BuiltChunk[] {
  return buildRowScopedSpreadsheetChunks({
    title: binding.title, documentVersion: binding.documentVersion,
    rows: artifact.spreadsheetRows ?? [], entities: binding.entities,
  });
}

function buildChunks(source: PhysicalSourceManifest, artifact: Artifact, binding: RegisteredAssetBinding): BuiltChunk[] {
  if (source.bindingMode === "row-scoped-required") return buildSpreadsheetChunks(artifact, binding);
  return artifact.chunks.map((chunk) => ({
    ...chunk, blockType: "hybrid", entityIds: binding.entities.map((entity) => entity.entityId),
    bindingMethod: "registered-document-entity",
  }));
}

const manifest = JSON.parse(await readFile("tmp/knowledge-v3-manifest.json", "utf8")) as Manifest;
const artifactDir = resolve("tmp/rag-v3-full");
const sourceInputs: Array<{ source: PhysicalSourceManifest; artifact: Artifact; artifactSha256: string }> = [];
const missingArtifacts: string[] = [];
for (const source of manifest.sources) {
  try {
    const raw = await readFile(resolve(artifactDir, `${source.sourceSha256}.json`), "utf8");
    const artifact = JSON.parse(raw) as Artifact;
    if (artifact.sourceSha256 !== source.sourceSha256 || artifact.extractorVersion !== "docling-v3.0.3") throw new Error("stale artifact");
    sourceInputs.push({ source, artifact, artifactSha256: sha256(raw) });
  } catch {
    missingArtifacts.push(source.storageKey);
  }
}

let logicalAssets = 0;
let units = 0;
let chunks = 0;
let candidateChunks = 0;
let openReviewItems = 0;
let acceptedReviewItems = 0;
let rowEntityBindings = 0;
for (const { source, artifact } of sourceInputs) {
  for (const binding of source.bindings) {
    const built = buildChunks(source, artifact, binding);
    logicalAssets++;
    units += artifact.units.length;
    chunks += built.length;
    candidateChunks += built.filter((chunk) => chunk.evidenceStatus === "candidate").length;
    rowEntityBindings += built.filter((chunk) => chunk.bindingMethod === "xlsx-model-cell-exact-normalized").length;
    for (const unit of artifact.units) {
      if (unit.status === "review-required" || unit.humanReviewDecision === "decorative-no-body") {
        if (unit.humanReviewDecision) acceptedReviewItems++;
        else openReviewItems++;
      }
    }
  }
}

const report = {
  mode: write ? "shadow-write" : "dry-run-read-only",
  releaseKey, registeredAssets: manifest.registeredAssets, physicalSources: manifest.physicalSources,
  artifactsPresent: sourceInputs.length, missingArtifacts: missingArtifacts.length, logicalAssets,
  units, chunks, candidateChunks, rowEntityBindings, openReviewItems, acceptedReviewItems,
  qwenEmbeddings: 0, bgeEmbeddings: 0, verifiedFacts: 0,
  externalCalls: { document: 0, model: 0, embedding: 0, search: 0, smtp: 0 },
};
if (!write) {
  console.log(JSON.stringify({ ...report, missingArtifactKeys: missingArtifacts }, null, 2));
  await getPool().end();
  process.exit(0);
}
if (missingArtifacts.length || logicalAssets !== manifest.registeredAssets) {
  throw new Error(`Full extraction is incomplete: ${missingArtifacts.length} physical sources and ${manifest.registeredAssets - logicalAssets} logical assets missing`);
}

const releases = await tenantQuery<{ id: string }>(OWNER_USER_ID, `
  insert into knowledge_release_v3(release_key,status,scope_kind,owner_id,extractor_profile,chunk_profile,manifest)
  values($1,'building','shared',null,$2,$3,$4::jsonb)
  on conflict(release_key) do update set extractor_profile=excluded.extractor_profile,
    chunk_profile=excluded.chunk_profile,manifest=excluded.manifest
  where knowledge_release_v3.status='building'
  returning id
`, [releaseKey, "docling-standard-v3.0.0/docling-v3.0.3", "hybrid-500-v3", JSON.stringify(report)], "admin");
if (!releases[0]) throw new Error("Release exists but is no longer building");
const releaseId = releases[0].id;

for (const { source, artifact, artifactSha256 } of sourceInputs) {
  for (const binding of source.bindings) {
    const built = buildChunks(source, artifact, binding);
    await tenantTransaction(OWNER_USER_ID, async (client) => {
      const revisionResult = await client.query<{ id: string }>(`
        insert into knowledge_source_revision_v3(release_id,asset_id,source_sha256,artifact_sha256,extractor_profile,parser_status,quality_summary)
        values($1,$2,$3,$4,$5,$6,$7::jsonb)
        on conflict(release_id,asset_id,source_sha256,extractor_profile) do update set
          artifact_sha256=excluded.artifact_sha256,parser_status=excluded.parser_status,quality_summary=excluded.quality_summary
        returning id
      `, [releaseId, binding.assetId, source.sourceSha256, artifactSha256, "docling-standard-v3.0.0/docling-v3.0.3",
        artifact.conversionStatus === "partial_success" ? "partial" : "success", JSON.stringify(artifact.metrics)]);
      const revisionId = revisionResult.rows[0].id;
      const unitIds = new Map<string, string>();
      for (const unit of artifact.units) {
        const unitResult = await client.query<{ id: string }>(`
          insert into knowledge_source_unit_v3(source_revision_id,unit_type,unit_index,status,content_sha256,error_code,review_note,reviewed_at,metrics)
          values($1,$2,$3,$4,$5,null,$6,$7,$8::jsonb)
          on conflict(source_revision_id,unit_type,unit_index) do update set status=excluded.status,
            content_sha256=excluded.content_sha256,review_note=excluded.review_note,reviewed_at=excluded.reviewed_at,metrics=excluded.metrics
          returning id
        `, [revisionId, unit.unitType, unit.unitIndex, unit.status, unit.contentSha256,
          unit.reviewReason ?? null, unit.reviewedAt ?? null,
          JSON.stringify({ textLength: unit.textLength, visualContentRatio: unit.visualContentRatio ?? null, humanReviewDecision: unit.humanReviewDecision ?? null })]);
        unitIds.set(`${unit.unitType}:${unit.unitIndex}`, unitResult.rows[0].id);
      }
      await client.query(`delete from knowledge_review_queue_v3 where release_id=$1 and asset_id=$2`, [releaseId, binding.assetId]);
      await client.query(`delete from knowledge_chunk_entity_v3 where chunk_id in(
        select id from knowledge_chunk_v3 where release_id=$1 and document_id=$2
      )`, [releaseId, binding.documentId]);
      await client.query(`delete from knowledge_chunk_v3 where release_id=$1 and document_id=$2 and chunk_index >= $3`,
        [releaseId, binding.documentId, built.length]);
      const relationByEntity = new Map(binding.entities.map((entity) => [entity.entityId, entity.relationType]));
      for (const chunk of built) {
        const sourceUnitId = unitIds.get(`${chunk.unitType}:${chunk.unitIndex}`) ?? null;
        const location = { unitType: chunk.unitType, unitIndex: chunk.unitIndex, sheetName: chunk.sheetName ?? null, rowStart: chunk.rowStart ?? null, rowEnd: chunk.rowEnd ?? null };
        const chunkResult = await client.query<{ id: string }>(`
          insert into knowledge_chunk_v3(release_id,document_id,source_revision_id,source_unit_id,parent_chunk_id,chunk_index,
            block_type,heading_path,source_location,content,canonical_embedding_text,token_estimate,content_sha256,metadata)
          values($1,$2,$3,$4,null,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13::jsonb)
          on conflict(release_id,document_id,chunk_index) do update set source_revision_id=excluded.source_revision_id,
            source_unit_id=excluded.source_unit_id,block_type=excluded.block_type,heading_path=excluded.heading_path,
            source_location=excluded.source_location,content=excluded.content,canonical_embedding_text=excluded.canonical_embedding_text,
            token_estimate=excluded.token_estimate,content_sha256=excluded.content_sha256,metadata=excluded.metadata
          returning id
        `, [releaseId, binding.documentId, revisionId, sourceUnitId, chunk.index, chunk.blockType, chunk.headingPath,
          JSON.stringify(location), chunk.content, chunk.canonicalEmbeddingText, chunk.tokenEstimate, chunk.contentSha256,
          JSON.stringify({ evidenceStatus: chunk.evidenceStatus ?? "parsed", bindingMethod: chunk.bindingMethod })]);
        for (const entityId of chunk.entityIds ?? []) {
          const relationType = relationByEntity.get(entityId) ?? "mentions";
          await client.query(`
            insert into knowledge_chunk_entity_v3(chunk_id,entity_id,relation_type,row_start,row_end,binding_method,binding_confidence)
            values($1,$2,$3,$4,$5,$6,1) on conflict(chunk_id,entity_id,relation_type) do update set
              row_start=excluded.row_start,row_end=excluded.row_end,binding_method=excluded.binding_method,binding_confidence=excluded.binding_confidence
          `, [chunkResult.rows[0].id, entityId, relationType, chunk.rowStart ?? null, chunk.rowEnd ?? null, chunk.bindingMethod]);
        }
      }
      for (const unit of artifact.units) {
        if (!["review-required","blank","failed"].includes(unit.status) && !unit.humanReviewDecision) continue;
        const sourceUnitId = unitIds.get(`${unit.unitType}:${unit.unitIndex}`)!;
        const accepted = Boolean(unit.humanReviewDecision);
        const reason = unit.status === "failed" ? "source-damaged" : unit.reviewReason?.includes("ocr") ? "ocr" : "layout";
        await client.query(`
          insert into knowledge_review_queue_v3(release_id,asset_id,source_unit_id,reason,status,resolution_note,reviewed_by,reviewed_at)
          select $1,$2,$3,$4,$5,$6,$7,$8
          where not exists(select 1 from knowledge_review_queue_v3 where release_id=$1 and asset_id=$2 and source_unit_id=$3 and reason=$4)
        `, [releaseId, binding.assetId, sourceUnitId, reason, accepted ? "accepted" : "open",
          accepted ? unit.humanReviewDecision : null, accepted ? OWNER_USER_ID : null, accepted ? unit.reviewedAt : null]);
      }
      const exceptionalUnits = artifact.units.filter((unit) => ["review-required","blank","failed"].includes(unit.status));
      const {processingStatus,resolutionStatus}=deriveReleaseAssetState(artifact.units);
      await client.query(`
        insert into knowledge_release_asset_v3(release_id,asset_id,processing_status,resolution_status,expected_units,actual_units,
          expected_chunks,actual_chunks,qwen_embeddings,bge_embeddings,verified_facts,candidate_facts,conflict_facts,human_decision_at,metrics)
        values($1,$2,$3,$4,$5,$5,$6,$6,0,0,0,0,0,$7,$8::jsonb)
        on conflict(release_id,asset_id) do update set processing_status=excluded.processing_status,resolution_status=excluded.resolution_status,
          expected_units=excluded.expected_units,actual_units=excluded.actual_units,expected_chunks=excluded.expected_chunks,
          actual_chunks=excluded.actual_chunks,human_decision_at=excluded.human_decision_at,metrics=excluded.metrics,updated_at=now()
      `, [releaseId, binding.assetId, processingStatus, resolutionStatus, artifact.units.length, built.length,
        exceptionalUnits.length && resolutionStatus === "accepted" ? new Date().toISOString() : null,
        JSON.stringify({ sourceSha256: source.sourceSha256, artifactSha256, candidateChunks: built.filter((chunk) => chunk.evidenceStatus === "candidate").length })]);
    }, "admin");
  }
}
console.log(JSON.stringify({ ...report, releaseId, status: "building-not-active" }, null, 2));
await getPool().end();
