import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import nextEnv from "@next/env";
import { getPool, query, tenantQuery } from "../src/lib/rag/db";
import { upsertKnowledgeDocument } from "../src/lib/rag/repository";
import { OWNER_USER_ID } from "../src/lib/auth/config";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

interface ProductRecord {
  model: string;
  productName: string;
  category: string;
  description: string;
  brand: string;
  lifecycleStatus: string;
  sourceFile: string;
  datasheetVersion?: string;
  datasheetFile?: string;
  knowledgeFile?: string;
  pageCount?: number;
  relatedModels?: string[];
}

interface ProductKnowledgeRecord {
  title: string;
  sourceFile: string;
  knowledgeFile: string;
  sourceType: string;
  category?: string;
  relatedModels?: string[];
  pageCount?: number;
  slideCount?: number;
}

const catalogPath = resolve("knowledge/product/processed/product-catalog.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
  allProducts: ProductRecord[];
  datasheets: ProductRecord[];
  catalogDocuments: ProductKnowledgeRecord[];
  references: ProductKnowledgeRecord[];
};

const supplementalProducts = catalog.datasheets
  .filter((item) => (item.relatedModels?.length ?? 0) === 0 && /^[A-Z0-9-]{2,40}$/i.test(item.model) && item.model.toLowerCase() !== "cudy")
  .filter((item, index, items) => items.findIndex((candidate) => candidate.model.toUpperCase() === item.model.toUpperCase()) === index);
const catalogProducts = [...catalog.allProducts, ...supplementalProducts.filter((item) =>
  !catalog.allProducts.some((product) => product.model.toUpperCase() === item.model.toUpperCase()),
)];

for (const product of catalogProducts) {
  const datasheet = catalog.datasheets.find((item) =>
    item.relatedModels?.some((model) => model.toUpperCase() === product.model.toUpperCase()),
  );
  await query(
    `insert into product_catalog (
       model, product_name, category, description, brand, lifecycle_status,
       datasheet_version, source_file, metadata, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     on conflict (model) do update set
       product_name = excluded.product_name, category = excluded.category,
       description = excluded.description, brand = excluded.brand,
       lifecycle_status = excluded.lifecycle_status, datasheet_version = excluded.datasheet_version,
       source_file = excluded.source_file, metadata = excluded.metadata, updated_at = now()`,
    [product.model, product.productName, product.category, product.description, product.brand,
      product.lifecycleStatus, datasheet?.datasheetVersion ?? null, datasheet?.datasheetFile ?? product.sourceFile,
      JSON.stringify({ datasheetFile: datasheet?.datasheetFile, pageCount: datasheet?.pageCount })],
  );
}

const knowledgeDocuments: Array<{
  title: string; sourceFile: string; knowledgeFile: string; sourceType: string;
  authorityLevel: 1 | 2 | 3 | 4 | 5; language: string; productId?: string; metadata: Record<string, unknown>;
}> = [
  ...catalog.datasheets.flatMap((product) => product.knowledgeFile ? [{
    title: `${product.relatedModels?.join(" / ") || product.model} Datasheet ${product.datasheetVersion ?? "Unknown"}`,
    sourceFile: product.sourceFile, knowledgeFile: product.knowledgeFile,
    sourceType: "public-product-datasheet", authorityLevel: 5 as const, language: "en",
    productId: product.relatedModels?.[0] ?? product.model,
    metadata: { category: product.category, datasheetVersion: product.datasheetVersion ?? "Unknown",
      sourceFile: product.sourceFile, pageCount: product.pageCount, relatedModels: product.relatedModels ?? [] },
  }] : []),
  ...catalog.catalogDocuments.map((document) => ({
    title: document.title, sourceFile: document.sourceFile, knowledgeFile: document.knowledgeFile,
    sourceType: document.sourceType, authorityLevel: 5 as const, language: "en",
    metadata: { category: document.category, relatedModels: document.relatedModels ?? [] },
  })),
  ...catalog.references.map((document) => ({
    title: document.title, sourceFile: document.sourceFile, knowledgeFile: document.knowledgeFile,
    sourceType: document.sourceType, authorityLevel: 4 as const,
    language: /[\u3400-\u9fff]/.test(document.title) ? "zh-CN" : "en",
    metadata: { relatedModels: document.relatedModels ?? [], pageCount: document.pageCount, slideCount: document.slideCount },
  })),
];

function documentExternalId(document: (typeof knowledgeDocuments)[number]): string {
  // Every category is rendered from the same workbook. Include the generated
  // category document path so those distinct documents are not collapsed into
  // a single external ID.
  const sourceIdentity = document.sourceType === "product-catalog-category"
    ? `${document.sourceFile}:${document.knowledgeFile}`
    : document.sourceFile;
  const sourceKey = createHash("sha256").update(`${document.sourceType}:${sourceIdentity}`).digest("hex").slice(0, 24);
  return `product:${document.sourceType}:${sourceKey}`;
}

for (const document of knowledgeDocuments) {
  const content = await readFile(resolve(document.knowledgeFile), "utf8");
  const result = await upsertKnowledgeDocument(OWNER_USER_ID, {
    collection: "product",
    externalId: documentExternalId(document),
    title: document.title,
    content,
    sourceType: document.sourceType,
    authorityLevel: document.authorityLevel,
    language: document.language,
    companyId: "cudy-technology",
    productId: document.productId,
    metadata: document.metadata,
    visibility: "shared",
  }, "admin");
  console.log(`${result.skipped ? "Unchanged" : "Ingested"}: ${document.title} (${result.chunks} chunks)`);
}

// Remove the one legacy category record created before category paths were
// included in the external ID. Its content is now represented by the complete
// set of independently addressable category documents above.
const legacyCategoryIds = [...new Set(catalog.catalogDocuments.map((document) => {
  const sourceKey = createHash("sha256").update(`${document.sourceType}:${document.sourceFile}`).digest("hex").slice(0, 24);
  return `product:${document.sourceType}:${sourceKey}`;
}))];
await tenantQuery(
  OWNER_USER_ID,
  `delete from knowledge_document
   where owner_id = $1 and source_type = 'product-catalog-category'
     and external_id = any($2::text[]) and not (external_id = any($3::text[]))`,
  [OWNER_USER_ID, legacyCategoryIds, knowledgeDocuments.map(documentExternalId)],
  "admin",
);

const counts = await query<{ products: string; documents: string; chunks: string }>(
  `select
     (select count(*) from product_catalog)::text as products,
     (select count(*) from knowledge_document d join knowledge_collection c on c.id = d.collection_id where c.slug = 'product' and d.status = 'active')::text as documents,
     (select count(*) from knowledge_chunk ch join knowledge_document d on d.id = ch.document_id join knowledge_collection c on c.id = d.collection_id where c.slug = 'product')::text as chunks`,
);
console.log(`Product catalog: ${counts[0].products}; product documents: ${counts[0].documents}; chunks: ${counts[0].chunks}`);
await getPool().end();
