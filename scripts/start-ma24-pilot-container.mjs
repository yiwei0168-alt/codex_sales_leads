import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.argv[2] ?? "/app");
if (process.env.NODE_ENV !== "production") throw new Error("Pilot container requires production mode");
if (!process.env.DATABASE_URL) throw new Error("Pilot container requires DATABASE_URL");
for (const key of ["DATABASE_MIGRATION_URL", "PAID_CALL_STAGE_OVERRIDE", "PAID_CALL_STAGE_OVERRIDE_USER_ID"]) {
  if (Object.hasOwn(process.env, key)) throw new Error(`Pilot container must not receive ${key}`);
}
if (!existsSync(join(root, "server.js"))) throw new Error("Pilot standalone server.js is missing");
for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  if (existsSync(join(root, name))) throw new Error(`Pilot container must not contain ${name}`);
}
process.chdir(root);
await import(pathToFileURL(join(root, "server.js")).href);
