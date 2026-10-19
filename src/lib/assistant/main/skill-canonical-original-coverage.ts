import {z} from 'zod';
import {digest} from './contracts';

const count=z.number().int().min(0).max(10000);
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const coverage=z.object({
 attachmentBytesRevalidated:z.literal(true),attachmentBytesCount:count,attachmentBytesManifestHash:hash,
 attachmentImmutableSnapshotCount:count,attachmentImmutableSnapshotManifestHash:hash,
 knowledgeReceiptBytesRevalidated:z.literal(true),knowledgeReceiptAssetCount:count,knowledgeReceiptBytesManifestHash:hash,
 knowledgeReceiptImmutableSnapshotCount:count,knowledgeReceiptImmutableSnapshotManifestHash:hash,
});

/** Internal component gate over actual byte-adapter results under retained
 * source locks. A readonly filesystem is not a canonical retained original.
 * Passing this gate grants neither production provenance nor activation. */
export function requireCanonicalSkillAcceptanceOriginals(sourceKind:string,bytes:unknown){
 if(sourceKind==='synthetic-fixture')return {canonicalOriginalCoverageRequired:false as const,canonicalOriginalCoverageRevalidated:false as const};
 if(sourceKind!=='production-runner-pending-verification')throw new Error('Unsupported acceptance original coverage source kind');
 const parsed=coverage.safeParse(bytes);
 if(!parsed.success)throw new Error('Acceptance canonical original coverage evidence missing or invalid');
 const value=parsed.data;
 if(value.attachmentBytesCount!==value.attachmentImmutableSnapshotCount
  ||value.knowledgeReceiptAssetCount!==value.knowledgeReceiptImmutableSnapshotCount)
  throw new Error('Acceptance originals require explicit canonical capture');
 return {canonicalOriginalCoverageRequired:true as const,canonicalOriginalCoverageRevalidated:true as const,
  canonicalOriginalCoverageHash:digest(value)};
}
