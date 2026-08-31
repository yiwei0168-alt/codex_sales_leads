import { createHash } from "node:crypto";

import type { WorkflowModelUsage, WorkflowStageMetric } from "./types";

export const LEAD_WORKFLOW_RUNTIME_VERSION = "3.0.0";

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

export function workflowDependencyFingerprint(stage: string, dependencies: Record<string, string> = {}): string {
  return createHash("sha256").update(JSON.stringify({ runtime: LEAD_WORKFLOW_RUNTIME_VERSION, stage,
    dependencies: Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right)) }))
    .digest("hex");
}

export function completedStageMetric(options: {
  stage: string;
  startedAt: number;
  input: unknown;
  output: unknown;
  inputItems?: number;
  outputItems?: number;
  paidSearchCredits?: number;
  generatedArtifacts?: number;
  validArtifacts?: number;
  downstreamUsedArtifacts?: number;
  dependencies?: Record<string, string>;
  metadata?: Record<string, unknown>;
}): WorkflowStageMetric {
  return {
    stage: options.stage,
    status: "completed",
    startedAt: new Date(options.startedAt).toISOString(),
    completedAt: new Date().toISOString(),
    inputItems: Math.max(0, options.inputItems ?? 1),
    inputBytes: jsonBytes(options.input),
    outputItems: Math.max(0, options.outputItems ?? 1),
    outputBytes: jsonBytes(options.output),
    paidSearchCredits: Math.max(0, options.paidSearchCredits ?? 0),
    generatedArtifacts: Math.max(0, options.generatedArtifacts ?? options.outputItems ?? 1),
    validArtifacts: Math.max(0, options.validArtifacts ?? options.outputItems ?? 1),
    downstreamUsedArtifacts: Math.max(0, options.downstreamUsedArtifacts ?? options.validArtifacts
      ?? options.outputItems ?? 1),
    dependencyFingerprint: workflowDependencyFingerprint(options.stage, options.dependencies),
    metadata: options.metadata ?? {},
  };
}

export interface WorkflowOptimizationOpportunity {
  stage: string;
  opportunityKey: string;
  severity: "low" | "medium" | "high";
  observation: string;
  recommendedAction: string;
  evidence: Record<string, unknown>;
}

export function detectWorkflowOptimizationOpportunities(
  metrics: WorkflowStageMetric[], modelUsage: WorkflowModelUsage[],
): WorkflowOptimizationOpportunity[] {
  const opportunities: WorkflowOptimizationOpportunity[] = [];
  for (const metric of metrics) {
    const usageRate = metric.generatedArtifacts === 0 ? 1
      : metric.downstreamUsedArtifacts / metric.generatedArtifacts;
    if (metric.generatedArtifacts >= 4 && usageRate < 0.5) opportunities.push({
      stage: metric.stage, opportunityKey: "low-downstream-artifact-use", severity: usageRate < 0.25 ? "high" : "medium",
      observation: `Only ${(usageRate * 100).toFixed(1)}% of generated artifacts were used downstream.`,
      recommendedAction: "Reduce generation breadth, tighten the stage schema, or defer optional artifacts until requested.",
      evidence: { generated: metric.generatedArtifacts, downstreamUsed: metric.downstreamUsedArtifacts, usageRate },
    });
    const outputExpansion = metric.inputBytes === 0 ? 0 : metric.outputBytes / metric.inputBytes;
    if (metric.outputBytes >= 20_000 && outputExpansion > 1.5) opportunities.push({
      stage: metric.stage, opportunityKey: "verbose-output-expansion", severity: outputExpansion > 3 ? "high" : "medium",
      observation: `Structured output is ${outputExpansion.toFixed(2)}x the serialized input size.`,
      recommendedAction: "Audit fields that are not cited, selected or displayed and shorten their schema limits.",
      evidence: { inputBytes: metric.inputBytes, outputBytes: metric.outputBytes, outputExpansion },
    });
    const validityRate = metric.generatedArtifacts === 0 ? 1 : metric.validArtifacts / metric.generatedArtifacts;
    if (metric.paidSearchCredits > 0 && validityRate < 0.6) opportunities.push({
      stage: metric.stage, opportunityKey: "low-paid-acquisition-validity", severity: validityRate < 0.35 ? "high" : "medium",
      observation: `Only ${(validityRate * 100).toFixed(1)}% of paid-search artifacts were valid.`,
      recommendedAction: "Tighten query templates, reuse local public evidence first, and stop acquisition after critical gaps close.",
      evidence: { paidSearchCredits: metric.paidSearchCredits, generated: metric.generatedArtifacts,
        valid: metric.validArtifacts, validityRate },
    });
  }
  const usageByStage = new Map<string, WorkflowModelUsage[]>();
  for (const usage of modelUsage) usageByStage.set(usage.stage, [...(usageByStage.get(usage.stage) ?? []), usage]);
  for (const [stage, usage] of usageByStage) {
    const total = usage.reduce((sum, item) => sum + item.totalTokens, 0);
    const fallbackCount = usage.filter((item) => item.fallbackUsed).length;
    if (usage.length >= 4 && total > 0 && fallbackCount / usage.length > 0.25) opportunities.push({
      stage, opportunityKey: "frequent-model-fallback", severity: "medium",
      observation: `${fallbackCount}/${usage.length} model calls used a fallback provider.`,
      recommendedAction: "Review primary-provider reliability and retry timing before changing the quality tier.",
      evidence: { calls: usage.length, fallbackCount, totalTokens: total },
    });
  }
  return opportunities;
}
