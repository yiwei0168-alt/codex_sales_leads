/** Read-only G15 runtime binding check. This command never makes a model call. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { assertMa24G15RuntimeBinding, type Ma24G15Preview } from "../src/lib/knowledge/evaluation/ma24-g15-runtime-binding";

const frozenPath = process.argv[2] ?? "docs/evidence/ma24-g15-config-preview-2026-10-16-v18.json";
const frozenBytes = await readFile(frozenPath);
const frozen = JSON.parse(frozenBytes.toString("utf8")) as Ma24G15Preview;
const output = execFileSync(process.execPath,
  ["scripts/run-tsx.cjs", "scripts/prepare-ma24-g15-config-local.ts"],
  { cwd: process.cwd(), encoding: "utf8", maxBuffer: 1_048_576 });
const loaded = JSON.parse(output) as Ma24G15Preview;
const nowUtcDate = new Date().toISOString().slice(0, 10);
const binding = assertMa24G15RuntimeBinding(frozen, loaded, nowUtcDate);
console.log(JSON.stringify({ schema: "ma24-g15-runtime-binding-v1", readOnly: true,
  frozenPreviewSha256: createHash("sha256").update(frozenBytes).digest("hex"),
  loadedPromptDateUtc: loaded.productPromptDateUtc, ...binding,
  modelCalls: 0, providerCalls: 0 }));
