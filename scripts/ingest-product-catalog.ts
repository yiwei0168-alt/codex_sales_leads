import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { getPool, query } from "../src/lib/rag/db";
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
}

const catalogPath = resolve("knowledge/product/processed/product-catalog.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
  allProducts: ProductRecord[];
  wifiRouters: ProductRecord[];
};

for (const product of catalog.allProducts) {
  const datasheet = catalog.wifiRouters.find((item) => item.model.toUpperCase() === product.model.toUpperCase());
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

for (const product of catalog.wifiRouters) {
  if (!product.knowledgeFile) continue;
  const content = await readFile(resolve(product.knowledgeFile), "utf8");
  const result = await upsertKnowledgeDocument(OWNER_USER_ID, {
    collection: "product",
    externalId: `product:${product.model.toLowerCase()}:datasheet:${(product.datasheetVersion ?? "unknown").toLowerCase()}`,
    title: `${product.model} ${product.productName} Datasheet ${product.datasheetVersion ?? "Unknown"}`,
    content,
    sourceType: "internal-product-datasheet",
    authorityLevel: 5,
    language: "en",
    companyId: "cudy-technology",
    productId: product.model,
    metadata: {
      category: product.category,
      datasheetVersion: product.datasheetVersion ?? "Unknown",
      sourceFile: product.datasheetFile,
      pageCount: product.pageCount,
    },
    visibility: "shared",
  }, "admin");
  console.log(`${result.skipped ? "Unchanged" : "Ingested"}: ${product.model} (${result.chunks} chunks)`);
}

const counts = await query<{ products: string; documents: string; chunks: string }>(
  `select
     (select count(*) from product_catalog)::text as products,
     (select count(*) from knowledge_document d join knowledge_collection c on c.id = d.collection_id where c.slug = 'product' and d.status = 'active')::text as documents,
     (select count(*) from knowledge_chunk ch join knowledge_document d on d.id = ch.document_id join knowledge_collection c on c.id = d.collection_id where c.slug = 'product')::text as chunks`,
);
console.log(`Product catalog: ${counts[0].products}; product documents: ${counts[0].documents}; chunks: ${counts[0].chunks}`);
await getPool().end();
