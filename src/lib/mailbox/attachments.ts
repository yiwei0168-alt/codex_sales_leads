import { readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { tenantQuery } from "@/lib/rag/db";
import { assertResolvedInsideKnowledgeRoot, safeKnowledgeStorageKey } from "@/lib/knowledge/document-repository";
export const mailAttachmentSchema = z.object({ assetId: z.uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/), filename: z.string().min(1).max(180).refine(v => !/[\r\n\\/\x00-\x1f]/.test(v)) }).strict();
export async function loadMailAttachments(userId: string, items: z.infer<typeof mailAttachmentSchema>[]) {
  let total = 0;
  const output = [];
  for (const item of items) {
    const rows = await tenantQuery<{ storage_key: string; source_sha256: string; byte_size: string; mime_type: string }>(userId,
      `select a.storage_key,a.source_sha256,a.byte_size::text,a.mime_type from knowledge_asset a join knowledge_document d on d.id=a.document_id
       where a.id=$1 and a.registration_status='registered' and (d.owner_id=$2 or d.visibility='shared')`, [item.assetId, userId]);
    const asset = rows[0];
    if (!asset || asset.source_sha256 !== item.sha256) throw new Error("Attachment changed or inaccessible");
    total += Number(asset.byte_size);
    if (total > 20 * 1024 * 1024) throw new Error("Attachments exceed 20 MB transport limit");
    const path = await realpath(resolve(safeKnowledgeStorageKey(asset.storage_key)));
    assertResolvedInsideKnowledgeRoot(path);
    const content = await readFile(path);
    if (content.length !== Number(asset.byte_size) || createHash("sha256").update(content).digest("hex") !== item.sha256) throw new Error("Attachment bytes changed; review again");
    output.push({ filename: item.filename, content, contentType: asset.mime_type });
  }
  return output;
}
