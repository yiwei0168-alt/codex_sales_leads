import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";

import { OWNER_USER_ID } from "../src/lib/auth/config";
import { getPool } from "../src/lib/rag/db";
import { embedPendingOutreachKnowledge, upsertOutreachSource } from "../src/lib/outreach/knowledge-repository";

nextEnv.loadEnvConfig(process.cwd());

interface CompanyDocument {
  externalId: string;
  title: string;
  topic: string;
  sourceFile: string;
  knowledgeFile: string;
  capturedAt: string;
}

const manifest = JSON.parse(await readFile(resolve("knowledge/company/processed/company-manifest.json"), "utf8")) as {
  documents: CompanyDocument[];
};
const selected = manifest.documents.filter((document) => ["company-brand-profile", "distribution-policy"].includes(document.topic));
if (selected.length !== 2) throw new Error("Outreach knowledge requires Cudy Profile Company and Cudy Distribution Policy");

try {
  for (const document of selected) {
    const content = await readFile(resolve(document.knowledgeFile), "utf8");
    const kind = document.topic === "distribution-policy" ? "distribution-policy" : "company-profile";
    const chunks = await upsertOutreachSource(OWNER_USER_ID, {
      externalId: `outreach:${document.topic}`,
      title: document.title,
      content,
      kind,
      priorityWeight: kind === "distribution-policy" ? 3 : 2.7,
      sourceRefs: { sourceFile: document.sourceFile, capturedAt: document.capturedAt, authority: 5 },
    });
    console.log(`Ingested outreach source: ${document.title} (${chunks} chunks)`);
  }
  const embedded = await embedPendingOutreachKnowledge(OWNER_USER_ID);
  console.log(`Embedded pending market/memory items: ${embedded}`);
} finally {
  await getPool().end();
}
