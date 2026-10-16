import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const appRoot = process.argv[2] && resolve(process.argv[2]);
if (!appRoot || !existsSync(join(appRoot, "server.js"))) {
  throw new Error("Provide the packaged standalone application directory containing server.js");
}
if (process.env.NODE_ENV !== "production") throw new Error("Pilot Web requires NODE_ENV=production");
if (!process.env.DATABASE_URL) throw new Error("Pilot Web requires a restricted DATABASE_URL");
for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  if (existsSync(join(appRoot, name))) throw new Error(`Packaged Web must not contain ${name}`);
}

// The local developer environment may contain migration credentials and paid-call
// overrides. Neither belongs in the long-running Web process.
delete process.env.DATABASE_MIGRATION_URL;
delete process.env.PAID_CALL_STAGE_OVERRIDE;
delete process.env.PAID_CALL_STAGE_OVERRIDE_USER_ID;
if (process.env.DATABASE_MIGRATION_URL || process.env.PAID_CALL_STAGE_OVERRIDE) {
  throw new Error("Pilot Web runtime credential boundary failed");
}
console.log(JSON.stringify({ pilotWebRuntimeBoundary: "passed", migrationCredentialPresent: false,
  paidCallOverridePresent: false }));
process.chdir(appRoot);
await import(pathToFileURL(join(appRoot, "server.js")).href);
