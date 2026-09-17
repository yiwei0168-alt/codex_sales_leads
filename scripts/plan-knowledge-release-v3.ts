import nextEnv from "@next/env";
import { OWNER_USER_ID } from "../src/lib/auth/config";
import { getPool, tenantQuery } from "../src/lib/rag/db";

nextEnv.loadEnvConfig(process.cwd());
if (!process.argv.includes("--dry-run")) throw new Error("v3 release planning currently supports --dry-run only");

const assets = await tenantQuery<{
  scope: "shared" | "owner"; mime: string; documentType: string; assets: number; bytes: string;
}>(OWNER_USER_ID, `select case when d.visibility='shared' then 'shared' else 'owner' end as scope,
    a.mime_type as mime,a.document_type as "documentType",count(*)::int as assets,sum(a.byte_size)::text as bytes
  from knowledge_asset a join knowledge_document d on d.id=a.document_id
  where a.registration_status='registered' and (d.visibility='shared' or d.owner_id=$1)
  group by scope,a.mime_type,a.document_type order by scope,a.mime_type,a.document_type`, [OWNER_USER_ID]);
const totals = assets.reduce((sum, row) => ({ assets: sum.assets + row.assets, bytes: sum.bytes + BigInt(row.bytes) }),
  { assets: 0, bytes: BigInt(0) });

console.log(JSON.stringify({
  mode: "dry-run-read-only", registeredAssets: totals.assets, registeredBytes: totals.bytes.toString(), groups: assets,
  expectedEmbeddingProfiles: [
    { key: "qwen-v4-1536", model: "text-embedding-v4", dimensions: 1536, paidAuthorization: "required-after-chunk-dry-run" },
    { key: "bge-m3-1024", model: "BAAI/bge-m3", dimensions: 1024, apiCashCost: 0, infrastructureCost: "unknown" },
  ],
  contentRead: false, databaseWrites: 0,
  externalCalls: { model: 0, embedding: 0, search: 0, smtp: 0 },
}, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2));
await getPool().end();
