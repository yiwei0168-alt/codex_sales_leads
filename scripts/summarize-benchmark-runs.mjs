import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const rawDirectory = path.resolve("experiments/global-model-lead-benchmark/runs/raw");
const files = (await readdir(rawDirectory)).filter((name) => name.includes("four-channel-categories-v4") && name.endsWith(".json")).sort();

const summaries = [];
for (const file of files) {
  const value = JSON.parse(await readFile(path.join(rawDirectory, file), "utf8"));
  if (file.includes("preflight")) continue;
  const raw = value.rawProviderResponse ?? {};
  const providerResponse = raw.response ?? raw;
  const categoryHeadings = [...String(value.answerText ?? "").matchAll(/^#{1,6}\s+.*(?:tier.?1|reseller|retailer|system integrator|\bSI\b)/gim)].length;
  summaries.push({
    file,
    providerId: value.providerId ?? value.systemId ?? null,
    repetition: value.repetition ?? null,
    attempt: value.attempt ?? null,
    eligible: value.scoringEligibility ?? null,
    searches: value.searchRequestsObserved ?? null,
    urls: Array.isArray(value.sourceUrls) ? value.sourceUrls.length : null,
    answerCharacters: typeof value.answerText === "string" ? value.answerText.length : null,
    answerPreview: typeof value.answerText === "string" ? value.answerText.slice(0, 500) : null,
    categoryHeadings,
    contentTypes: Array.isArray(providerResponse.content) ? providerResponse.content.map((item) => item?.type ?? null) : null,
    stopReason: providerResponse.stop_reason ?? providerResponse.finish_reason ?? providerResponse.status ?? null,
    incompleteReason: providerResponse.incomplete_details?.reason ?? null,
    error: value.error?.message ?? value.error ?? null,
  });
}

console.log(JSON.stringify(summaries, null, 2));
