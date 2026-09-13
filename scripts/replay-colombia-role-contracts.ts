// Offline contract coverage only: never score, fetch evidence, call providers or mutate frozen inputs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { correctionCompletion } from "../src/lib/leads/workflow/correction-completion";
import { roleScoringAnchors } from "../src/lib/leads/workflow/role-scoring-anchors";
import type { LeadCandidateCorrection } from "../src/lib/leads/workflow/types";

const categories = ["distribution", "resale", "retail", "si-msp"];
const counts: Record<string, number> = {};
const sources = categories.map(category => {
  const path = `experiments/search-e2e-evaluation/co-v2/runs/raw/2026-09-08-co-search-e2e-v2/cells/CO-${category}/product-e2e.json`;
  const bytes = readFileSync(resolve(path));
  const data = JSON.parse(bytes.toString("utf8")) as { raw: { corrected: Array<{ correction: LeadCandidateCorrection }> } };
  const rows = data.raw.corrected.map(({ correction }, index) => {
    const completion = correctionCompletion(correction);
    const anchor = roleScoringAnchors(correction);
    const status = anchor ? "concrete-role-covered" : completion === "retry-required"
      ? "correction-retry-required" : "primary-role-pending";
    counts[status] = (counts[status] ?? 0) + 1;
    return { pointer: `/raw/corrected/${index}/correction`, completion, status,
      primaryFamily: anchor?.primaryFamily ?? null, primarySubtype: anchor?.primarySubtype ?? null,
      scorecardKey: anchor?.scorecardKey ?? null };
  });
  return { path, sha256: createHash("sha256").update(bytes).digest("hex"), category, rows };
});
const report = {
  version: "colombia-role-contract-coverage-v1",
  boundary: "Stored correction records, not unique companies or recovered qualified leads. No semantic rejudging; original scores and blind-review outcomes unchanged.",
  paidCalls: 0, counts, sources,
};
const output = resolve("docs/reports/COLOMBIA_ROLE_CONTRACT_COVERAGE_2026-09-13.json");
const encoded = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== encoded) throw new Error("Frozen role contract coverage differs from recorded report");
} else writeFileSync(output, encoded);
console.log(JSON.stringify({ boundary: report.boundary, counts, paidCalls: 0 }));
