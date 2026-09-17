import nextEnv from "@next/env";
import { OWNER_USER_ID } from "../src/lib/auth/config";
import { getPool, tenantQuery } from "../src/lib/rag/db";

nextEnv.loadEnvConfig(process.cwd());

const terms = process.argv.slice(2).map((value) => value.trim()).filter(Boolean);

const rows = await tenantQuery<{
  storageKey: string;
  title: string;
  mimeType: string;
  byteSize: string;
}>(OWNER_USER_ID, `
  select a.storage_key as "storageKey", d.title, a.mime_type as "mimeType", a.byte_size::text as "byteSize"
  from knowledge_asset a
  join knowledge_document d on d.id = a.document_id
  where a.registration_status = 'registered'
    and (d.visibility = 'shared' or d.owner_id = $1)
    and (cardinality($2::text[]) = 0 or exists (
      select 1 from unnest($2::text[]) term
      where a.storage_key ilike '%' || term || '%' or d.title ilike '%' || term || '%'
    ))
  order by a.storage_key
`, [OWNER_USER_ID, terms]);

console.log(JSON.stringify({ mode: "read-only", terms, assets: rows }, null, 2));
await getPool().end();
