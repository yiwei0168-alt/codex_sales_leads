import { readFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import nextEnv from "@next/env";
import { upsertKnowledgeDocument } from "../src/lib/rag/repository";
import type { KnowledgeBaseType } from "../src/lib/rag/types";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

const type = argument("type") as KnowledgeBaseType | undefined;
const file = argument("file");
const sourceUrl = argument("source-url");
const externalId = argument("external-id");
const title = argument("title");

if (!type || !["industry", "company", "product"].includes(type) || !file) {
  throw new Error("Usage: npm run kb:ingest -- --type=industry|company|product --file=path.md [--source-url=https://...] [--external-id=id] [--title=Title]");
}

const absolutePath = resolve(file);
const content = await readFile(absolutePath, "utf8");
const id = externalId ?? `${type}:${basename(file).replace(/\.[^.]+$/, "")}`;
const result = await upsertKnowledgeDocument({
  collection: type,
  externalId: id,
  title: title ?? basename(file),
  content,
  sourceUrl,
  sourceType: sourceUrl ? "public-url-import" : "maintained-file",
  authorityLevel: sourceUrl ? 4 : 5,
  language: "zh-CN",
  market: type === "industry" ? argument("market") : undefined,
  companyId: type === "company" ? "cudy-technology" : undefined,
  productId: type === "product" ? (argument("product-id") ?? id) : undefined,
  metadata: { importedFrom: absolutePath },
});
console.log(`${result.skipped ? "Unchanged" : "Ingested"}: ${id} (${result.chunks} chunks)`);
