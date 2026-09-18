import nextEnv from "@next/env";
import { OWNER_USER_ID } from "../src/lib/auth/config";
import { getPool, tenantQuery, tenantTransaction } from "../src/lib/rag/db";

nextEnv.loadEnvConfig(process.cwd());
const write = process.argv.includes("--write");

type Asset = { assetId: string; documentId: string; title: string; storageKey: string };
const assets = await tenantQuery<Asset>(OWNER_USER_ID, `
  select a.id as "assetId",a.document_id as "documentId",d.title,a.storage_key as "storageKey"
  from knowledge_asset a join knowledge_document d on d.id=a.document_id
  where a.registration_status='registered'
    and (d.visibility='shared' or d.owner_id=$1)
    and not exists(
      select 1 from knowledge_document_entity de join knowledge_entity e on e.id=de.entity_id
      where de.document_id=d.id and e.entity_type='product'
    )
  order by a.storage_key,a.id
`, [OWNER_USER_ID], "admin");

const planned = assets.flatMap((asset) => {
  if (!/datasheet/i.test(`${asset.title} ${asset.storageKey}`)) return [];
  const match = asset.title.normalize("NFKC").match(/^(.+?)\s+Datasheet(?:\s+(?:V?[0-9]|Unknown)|$)/i);
  if (!match) return [];
  const model = match[1].trim().replace(/\s+/g, " ");
  if (model.toUpperCase() === "CUDY" || !/^[A-Za-z0-9][A-Za-z0-9._+ -]{1,63}$/.test(model)) return [];
  return [{ ...asset, canonicalKey: model, displayName: model }];
});

if (write) {
  await tenantTransaction(OWNER_USER_ID, async (client) => {
    for (const item of planned) {
      const entity = await client.query<{ id: string }>(`
        insert into knowledge_entity(entity_type,canonical_key,display_name,metadata)
        values('product',$1,$2,$3::jsonb)
        on conflict(entity_type,canonical_key) do update set display_name=excluded.display_name,
          metadata=knowledge_entity.metadata||excluded.metadata
        returning id
      `, [item.canonicalKey, item.displayName, JSON.stringify({
        bindingMethod: "datasheet-title-exact-normalized",
        ruleVersion: "datasheet-title-v1",
      })]);
      await client.query(`
        insert into knowledge_document_entity(document_id,entity_id,relation_type)
        values($1,$2,'about') on conflict do nothing
      `, [item.documentId, entity.rows[0].id]);
    }
  }, "admin");
}

console.log(JSON.stringify({
  mode: write ? "deterministic-write" : "dry-run-read-only",
  unboundProductAssets: assets.length,
  exactDatasheetBindings: planned.length,
  items: planned.map((item) => ({ title: item.title, canonicalKey: item.canonicalKey, storageKey: item.storageKey })),
  skippedUnboundAssets: assets.length - planned.length,
  externalCalls: { model: 0, embedding: 0, search: 0, smtp: 0 },
}, null, 2));
await getPool().end();
