import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { sanitizeText, type ChannelId } from "../lib/evaluation";
import { PublicPageFetcher } from "../lib/public-page-fetcher";

interface RawCandidate {
  placeId: string;
  displayName: string;
  websiteUri: string | null;
}

interface RawArtifact {
  channelId: ChannelId;
  cells: Array<{ regionId: string; query: string; candidates: RawCandidate[] }>;
}

interface Config {
  runId: string;
  systemId: string;
  channels: Array<{ id: ChannelId }>;
}

interface Occurrence {
  channelId: ChannelId;
  placeId: string;
  regionId: string;
  query: string;
  ordinal: number;
}

interface CandidateGroup {
  key: string;
  displayName: string;
  websiteUri: string | null;
  occurrences: Occurrence[];
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function publicWebsite(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password
      || host.endsWith("google.com") || host.endsWith("google.de") || host.endsWith("googleusercontent.com")) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function host(value: string): string {
  return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
}

function normalized(value: string): string {
  return value.toLowerCase()
    .replace(/\b(?:gmbh|ag|kg|ug|mbh|se|co|ltd|e\.k|gruppe|group)\b/g, " ")
    .replace(/[^a-z0-9äöüß]+/g, " ").replace(/\s+/g, " ").trim();
}

function identityMatches(group: CandidateGroup, resolvedUrl: string, pageText: string): boolean {
  const normalizedText = normalized(pageText);
  const normalizedName = normalized(group.displayName);
  const meaningfulTokens = normalizedName.split(" ").filter((token) => token.length >= 5
    && !["systemhaus", "netzwerk", "computer", "technik", "service", "solution", "solutions"].includes(token));
  const domainToken = host(resolvedUrl).split(".")[0].replace(/[^a-z0-9äöüß]/g, "");
  return (normalizedName.length >= 6 && normalizedText.includes(normalizedName))
    || meaningfulTokens.some((token) => normalizedText.includes(token))
    || (domainToken.length >= 5 && (normalizedName.replace(/\s/g, "").includes(domainToken)
      || normalizedText.includes(domainToken)));
}

function compactExcerpt(value: string): string {
  return sanitizeText(value).slice(0, 6_000);
}

async function parallelMap<T, U>(values: T[], concurrency: number, mapper: (value: T, index: number) => Promise<U>): Promise<U[]> {
  const output = new Array<U>(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      output[index] = await mapper(values[index], index);
    }
  }));
  return output;
}

const root = path.resolve("experiments/multi-source-lead-discovery");
const config = JSON.parse(await readFile(path.join(root, "config/google-places-local-v1.3.json"), "utf8")) as Config;
const rawRoot = path.join(root, "runs/raw", config.runId, "google-places-local");
const artifactRoot = path.join(root, "artifacts/runs", config.runId);
const rawArtifacts = await Promise.all(config.channels.map(({ id }) =>
  readFile(path.join(rawRoot, `${id}.json`), "utf8").then((value) => JSON.parse(value) as RawArtifact)));

const groups = new Map<string, CandidateGroup>();
let ordinal = 0;
for (const artifact of rawArtifacts) {
  for (const cell of artifact.cells) {
    for (const candidate of cell.candidates) {
      ordinal += 1;
      const websiteUri = publicWebsite(candidate.websiteUri);
      const key = websiteUri ? `host:${host(websiteUri)}` : `place:${candidate.placeId}`;
      const occurrence = { channelId: artifact.channelId, placeId: candidate.placeId,
        regionId: cell.regionId, query: cell.query, ordinal };
      const existing = groups.get(key);
      if (existing) existing.occurrences.push(occurrence);
      else groups.set(key, { key, displayName: candidate.displayName, websiteUri, occurrences: [occurrence] });
    }
  }
}

const fetcher = new PublicPageFetcher(fetch, 12_000);
const groupList = [...groups.values()].sort((left, right) => Math.min(...left.occurrences.map((item) => item.ordinal))
  - Math.min(...right.occurrences.map((item) => item.ordinal)));
let finished = 0;
const resolved = await parallelMap(groupList, 6, async (group) => {
  let resolution: {
    status: "independent-official-page-confirmed" | "unresolved-no-independent-page";
    companyName: string;
    officialUrl: string | null;
    homepageEvidence: { url: string; excerpt: string; capturedAt: string } | null;
    failureReason: string | null;
  };
  if (!group.websiteUri) {
    resolution = {
      status: "unresolved-no-independent-page",
      companyName: `Unresolved Google Place ${digest(group.key).slice(0, 10).toUpperCase()}`,
      officialUrl: null,
      homepageEvidence: null,
      failureReason: "Google Places did not provide a non-Google website URI.",
    };
  } else {
    try {
      const page = await fetcher.fetch(group.websiteUri, AbortSignal.timeout(30_000));
      if (!identityMatches(group, page.url, page.text)) throw new Error("Official-page text did not confirm the submitted company identity");
      resolution = {
        status: "independent-official-page-confirmed",
        companyName: group.displayName,
        officialUrl: page.url,
        homepageEvidence: { url: page.url, excerpt: compactExcerpt(page.text), capturedAt: new Date().toISOString() },
        failureReason: null,
      };
    } catch (error) {
      resolution = {
        status: "unresolved-no-independent-page",
        companyName: `Unresolved Google Place ${digest(group.key).slice(0, 10).toUpperCase()}`,
        officialUrl: null,
        homepageEvidence: null,
        failureReason: error instanceof Error ? error.message : String(error),
      };
    }
  }
  finished += 1;
  console.log(JSON.stringify({ progress: `${finished}/${groupList.length}`, status: resolution.status }));
  return {
    candidateId: `GPL-${digest(group.key).slice(0, 12).toUpperCase()}`,
    placeIds: [...new Set(group.occurrences.map((item) => item.placeId))].sort(),
    resolutionStatus: resolution.status,
    companyName: resolution.companyName,
    officialUrl: resolution.officialUrl,
    homepageEvidence: resolution.homepageEvidence,
    failureReason: resolution.failureReason,
    occurrences: group.occurrences,
  };
});

for (const channel of config.channels) {
  let rank = 0;
  for (const candidate of resolved
    .filter((item) => item.occurrences.some((occurrence) => occurrence.channelId === channel.id))
    .sort((left, right) => Math.min(...left.occurrences.filter((item) => item.channelId === channel.id).map((item) => item.ordinal))
      - Math.min(...right.occurrences.filter((item) => item.channelId === channel.id).map((item) => item.ordinal)))) {
    rank += 1;
    for (const occurrence of candidate.occurrences.filter((item) => item.channelId === channel.id)) {
      (occurrence as Occurrence & { companyRank: number }).companyRank = rank;
    }
  }
}

await mkdir(path.join(artifactRoot, "evidence"), { recursive: true });
await writeFile(path.join(artifactRoot, "evidence/google-places-local-resolved-candidates.json"), `${JSON.stringify({
  schemaVersion: 1,
  protocolVersion: "multi-source-professional-discovery-v1.3-google-places-local",
  runId: config.runId,
  systemId: config.systemId,
  attribution: "Candidate discovery powered by Google Maps; committed names and URLs are retained only when independently confirmed from the public company page.",
  summary: {
    rawOccurrences: rawArtifacts.flatMap((artifact) => artifact.cells).reduce((sum, cell) => sum + cell.candidates.length, 0),
    placeLevelGroups: groupList.length,
    independentlyResolvedCompanies: resolved.filter((item) => item.resolutionStatus === "independent-official-page-confirmed").length,
    unresolvedOpaqueCandidates: resolved.filter((item) => item.resolutionStatus === "unresolved-no-independent-page").length,
    officialDomainMerges: groupList.reduce((sum, group) => sum + Math.max(0, new Set(group.occurrences.map((item) => item.placeId)).size - 1), 0),
  },
  candidates: resolved,
}, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  groups: groupList.length,
  resolved: resolved.filter((item) => item.resolutionStatus === "independent-official-page-confirmed").length,
  unresolved: resolved.filter((item) => item.resolutionStatus === "unresolved-no-independent-page").length,
}, null, 2));
