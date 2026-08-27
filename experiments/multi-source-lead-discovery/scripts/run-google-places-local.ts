import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import nextEnv from "@next/env";

import { searchGooglePlacesLocalCell, type GooglePlacesLocalCandidate, type GooglePlacesLocalRegion } from "../lib/google-places-local";
import type { ChannelId } from "../lib/evaluation";

interface Config {
  schemaVersion: 1;
  protocolVersion: string;
  runId: string;
  sourceRunId: string;
  systemId: string;
  countryCode: string;
  languageCode: string;
  discoveryEvidenceRequired: false;
  pageSize: number;
  maxPagesPerCell: number;
  minimumAcceptedBeforePaginationStops: number;
  channels: Array<{ id: ChannelId; eligibleRoles: string[]; shortQueries: string[] }>;
  regions: GooglePlacesLocalRegion[];
  filters: Record<string, unknown>;
  persistence: Record<string, unknown>;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function timestamp(): string {
  return new Date().toISOString();
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

nextEnv.loadEnvConfig(process.cwd());
const root = path.resolve("experiments/multi-source-lead-discovery");
const configPath = path.join(root, "config/google-places-local-v1.3.json");
const configBytes = await readFile(configPath);
const config = JSON.parse(configBytes.toString("utf8")) as Config;
const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not configured");
const baseUrl = process.env.GOOGLE_PLACES_BASE_URL?.trim() || "https://places.googleapis.com/v1";
const rawRoot = path.join(root, "runs/raw", config.runId, "google-places-local");
const artifactRoot = path.join(root, "artifacts/runs", config.runId);
const capturedAt = timestamp();

for (let channelIndex = 0; channelIndex < config.channels.length; channelIndex += 1) {
  const channel = config.channels[channelIndex];
  const cells = [];
  for (let regionIndex = 0; regionIndex < config.regions.length; regionIndex += 1) {
    const region = config.regions[regionIndex];
    const query = channel.shortQueries[(regionIndex + channelIndex) % channel.shortQueries.length];
    console.log(`[google-places-local] ${channel.id} ${region.id}: ${query}`);
    cells.push(await searchGooglePlacesLocalCell({
      apiKey, baseUrl, query, region,
      countryCode: config.countryCode,
      languageCode: config.languageCode,
      pageSize: config.pageSize,
      maxPages: config.maxPagesPerCell,
      minimumAcceptedBeforePaginationStops: config.minimumAcceptedBeforePaginationStops,
      signal: AbortSignal.timeout(120_000),
    }));
  }
  const candidatesByPlaceId = new Map<string, GooglePlacesLocalCandidate>();
  for (const candidate of cells.flatMap((cell) => cell.candidates)) candidatesByPlaceId.set(candidate.placeId, candidate);
  const candidates = [...candidatesByPlaceId.values()];
  const rawPath = path.join(rawRoot, `${channel.id}.json`);
  await writeJson(rawPath, {
    schemaVersion: 1,
    protocolVersion: config.protocolVersion,
    runId: config.runId,
    systemId: config.systemId,
    channelId: channel.id,
    capturedAt,
    temporaryGoogleMapsContent: true,
    attribution: "Google Maps",
    cells,
    candidates,
  });
  const rawBytes = await readFile(rawPath);
  await writeJson(path.join(artifactRoot, "discovery", config.systemId, `${channel.id}.json`), {
    schemaVersion: 1,
    protocolVersion: config.protocolVersion,
    runId: config.runId,
    systemId: config.systemId,
    channelId: channel.id,
    discoveryEvidenceRequired: false,
    sourceRawSha256: sha256(rawBytes),
    sourceRawCommitted: false,
    attribution: "Powered by Google Maps",
    queryCells: cells.map((cell) => ({
      query: cell.query,
      regionId: cell.regionId,
      requestCount: cell.requestCount,
      returnedCount: cell.returnedCount,
      operationalGermanyCount: cell.operationalGermanyCount,
      rejectedByBusinessStatus: cell.rejectedByBusinessStatus,
      rejectedByCountry: cell.rejectedByCountry,
      placeIds: cell.candidates.map((candidate) => candidate.placeId),
    })),
    uniquePlaceIds: candidates.map((candidate) => candidate.placeId).sort(),
    summary: {
      requestCount: cells.reduce((sum, cell) => sum + cell.requestCount, 0),
      returnedCount: cells.reduce((sum, cell) => sum + cell.returnedCount, 0),
      operationalGermanyOccurrences: cells.reduce((sum, cell) => sum + cell.operationalGermanyCount, 0),
      uniqueOperationalGermanyPlaces: candidates.length,
    },
  });
}

await writeJson(path.join(artifactRoot, "manifests/google-places-local-discovery.json"), {
  schemaVersion: 1,
  protocolVersion: config.protocolVersion,
  runId: config.runId,
  sourceRunId: config.sourceRunId,
  systemId: config.systemId,
  configSha256: sha256(configBytes),
  discoveryEvidenceRequired: false,
  filters: config.filters,
  persistence: config.persistence,
  completedAt: timestamp(),
});
console.log(JSON.stringify({ runId: config.runId, systemId: config.systemId, status: "succeeded" }, null, 2));
