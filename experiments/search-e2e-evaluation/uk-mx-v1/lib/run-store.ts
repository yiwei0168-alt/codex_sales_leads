import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ExperimentCostEvent } from "./cost-ledger";
import { EXPERIMENT_CONFIG } from "./experiment";

export interface FormalRunState {
  schemaVersion: 1;
  runId: string;
  experimentId: string;
  status: "created" | "preflight-passed" | "running" | "budget-paused" | "completed" | "invalid";
  createdAt: string;
  updatedAt: string;
  blindJudgeModel?: string;
  completedCellIds: string[];
  reportedBudgetThresholdsUsd: number[];
  costEvents: ExperimentCostEvent[];
  anomalies: Array<{ at: string; cellId?: string; severity: "warning" | "fatal"; code: string; detail: string }>;
}

const experimentRoot = path.resolve("experiments/search-e2e-evaluation/uk-mx-v1");

export function rawRunRoot(runId = EXPERIMENT_CONFIG.runId): string {
  return path.join(experimentRoot, "runs/raw", runId);
}

export function artifactRunRoot(runId = EXPERIMENT_CONFIG.runId): string {
  return path.join(experimentRoot, "artifacts/runs", runId);
}

export async function writeJsonAtomic(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filename);
}

export async function readJson<T>(filename: string): Promise<T> {
  return JSON.parse(await readFile(filename, "utf8")) as T;
}

export async function readJsonIfExists<T>(filename: string): Promise<T | null> {
  try { return await readJson<T>(filename); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadRunState(): Promise<FormalRunState> {
  const filename = path.join(rawRunRoot(), "run-state.json");
  const existing = await readJsonIfExists<FormalRunState>(filename);
  if (existing) return existing;
  const now = new Date().toISOString();
  return { schemaVersion: 1, runId: EXPERIMENT_CONFIG.runId, experimentId: EXPERIMENT_CONFIG.experimentId,
    status: "created", createdAt: now, updatedAt: now, completedCellIds: [],
    reportedBudgetThresholdsUsd: [], costEvents: [], anomalies: [] };
}

export async function saveRunState(state: FormalRunState): Promise<void> {
  const next = { ...state, updatedAt: new Date().toISOString() };
  await writeJsonAtomic(path.join(rawRunRoot(state.runId), "run-state.json"), next);
  await writeJsonAtomic(path.join(artifactRunRoot(state.runId), "runtime/run-summary.json"), {
    schemaVersion: next.schemaVersion, runId: next.runId, experimentId: next.experimentId, status: next.status,
    createdAt: next.createdAt, updatedAt: next.updatedAt, blindJudgeModel: next.blindJudgeModel,
    completedCellIds: next.completedCellIds, reportedBudgetThresholdsUsd: next.reportedBudgetThresholdsUsd,
    anomalies: next.anomalies, costEvents: next.costEvents,
  });
}
