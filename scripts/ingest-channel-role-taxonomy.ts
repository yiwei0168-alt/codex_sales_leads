import nextEnv from "@next/env";
import { OWNER_USER_ID } from "../src/lib/auth/config";
import { CHANNEL_ROLE_TAXONOMY_DOCUMENT } from "../src/data/channel-role-taxonomy";
import { getPool } from "../src/lib/rag/db";
import { upsertKnowledgeDocument } from "../src/lib/rag/repository";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

try {
  const result = await upsertKnowledgeDocument(
    OWNER_USER_ID,
    CHANNEL_ROLE_TAXONOMY_DOCUMENT,
    "admin",
  );

  console.log(JSON.stringify({
    externalId: CHANNEL_ROLE_TAXONOMY_DOCUMENT.externalId,
    title: CHANNEL_ROLE_TAXONOMY_DOCUMENT.title,
    visibility: CHANNEL_ROLE_TAXONOMY_DOCUMENT.visibility,
    confirmedRoles: CHANNEL_ROLE_TAXONOMY_DOCUMENT.metadata.confirmedRoles,
    documentId: result.documentId,
    chunks: result.chunks,
    skipped: result.skipped,
  }, null, 2));
} finally {
  await getPool().end();
}
