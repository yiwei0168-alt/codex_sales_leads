import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { getPool } from "../src/lib/rag/db";
import { upsertKnowledgeDocument } from "../src/lib/rag/repository";
import { OWNER_USER_ID } from "../src/lib/auth/config";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

interface IndustryDocument {
  externalId: string;
  title: string;
  topic: string;
  authorityLevel: 1 | 2 | 3 | 4 | 5;
  language: string;
  sourceFile: string;
  sourceType: string;
  knowledgeFile: string;
  unitCount: number;
  capturedAt: string;
}

const manifest = JSON.parse(await readFile(resolve("knowledge/industry/processed/industry-manifest.json"), "utf8")) as {
  documents: IndustryDocument[];
};

try {
  for (const document of manifest.documents) {
    const content = await readFile(resolve(document.knowledgeFile), "utf8");
    const result = await upsertKnowledgeDocument(OWNER_USER_ID, {
      collection: "industry",
      externalId: document.externalId,
      title: document.title,
      content,
      sourceType: document.sourceType,
      authorityLevel: document.authorityLevel,
      language: document.language,
      capturedAt: document.capturedAt,
      metadata: {
        topic: document.topic,
        sourceFile: document.sourceFile,
        sourceUnitCount: document.unitCount,
        temporalReviewRequired: document.topic === "brand-market-landscape",
      },
    });
    console.log(`${result.skipped ? "Unchanged" : "Ingested"}: ${document.title} (${result.chunks} chunks)`);
  }
} finally {
  await getPool().end();
}
