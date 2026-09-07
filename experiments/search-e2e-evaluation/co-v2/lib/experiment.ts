import experimentJson from "../config/experiment.v2.0.0.json";

import type { ChannelRole } from "@/lib/domain";
import type { LeadSearchPlan } from "@/lib/assistant/types";

export type ExperimentCategoryId = "distribution" | "resale" | "retail" | "si-msp";
export type ExperimentCountryCode = "CO";
export type ExperimentArm = "gemini-native" | "product-e2e";

export interface ExperimentCell {
  sequence: number;
  cellId: string;
  countryCode: ExperimentCountryCode;
  countryName: string;
  primaryLanguage: string;
  supplementaryLanguages: string[];
  categoryId: ExperimentCategoryId;
  categoryLabel: string;
  categoryDefinition: string;
  roles: ChannelRole[];
  armStartOrder: ExperimentArm[];
}

const categoryDetails: Record<ExperimentCategoryId, { label: string; definition: string; roles: ChannelRole[] }> = {
  distribution: { label: "Distributor/VAD",
    definition: "A distributor or value-added distributor whose defining business action is supplying downstream resellers, VARs, dealers, integrators or other channel partners.",
    roles: ["Distributor", "VAD"] },
  resale: { label: "Reseller/VAR",
    definition: "A B2B reseller or value-added reseller whose defining business action is selling networking products or solutions to business customers, often with pre-sales, configuration, integration or support.",
    roles: ["Reseller", "VAR", "Dealer"] },
  retail: { label: "Retailer/E-tailer",
    definition: "A consumer-facing retailer or e-tailer that merchandises and fulfils networking products for home, SOHO or individual buyers through owned stores or an owned online shop.",
    roles: ["Retailer", "E-tailer"] },
  "si-msp": { label: "SI/MSP",
    definition: "A system integrator or managed service provider whose defining business action is designing, deploying, integrating or operating networks for B2B project customers.",
    roles: ["SI", "MSP"] },
};

type ConfigShape = typeof experimentJson;
export const EXPERIMENT_CONFIG: ConfigShape = experimentJson;

export function validateExperimentConfig(): void {
  const config = EXPERIMENT_CONFIG;
  if (config.sample.cells !== 4 || config.sample.slotsPerArmPerCell !== 50
    || config.sample.slotsPerArm !== 200 || config.sample.totalSlots !== 400) {
    throw new Error("Frozen sample invariants do not equal 4 cells / 50 slots per cell / 200 slots per arm / 400 total slots");
  }
  if (config.cost.hardBudgetUsd !== 50
    || JSON.stringify(config.cost.reviewThresholdUsd) !== JSON.stringify([10, 20, 30])
    || config.cost.unknownUsageCallReserveUsd !== 0.01) {
    throw new Error("Frozen budget invariants do not equal USD 50, 10/20/30 checkpoints and USD 0.01 unknown-usage reserve");
  }
  const ids = new Set(config.executionOrder.map((cell) => cell.cellId));
  if (ids.size !== 4 || config.executionOrder.some((cell, index) => cell.sequence !== index + 1)) {
    throw new Error("Frozen execution order must contain four unique, consecutively numbered cells");
  }
  if (config.arms["gemini-native"].model !== "gemini-3.6-flash"
    || JSON.stringify(config.blindAudit.judgeModels) !== JSON.stringify(["anthropic/claude-opus-5", "openai/gpt-5.6-sol"])) {
    throw new Error("Frozen control or blind-judge model changed");
  }
  const productModels = config.arms["product-e2e"].models;
  if (productModels.discoveryGateRoutine !== "deepseek-v4-flash"
    || productModels.roleCorrectionRoutine !== "deepseek-v4-flash"
    || productModels.qualificationRoutine !== "deepseek-v4-flash"
    || productModels.materialEscalation !== "deepseek-v4-pro") {
    throw new Error("Frozen product-stage model bindings changed");
  }
  if (config.blindAudit.arbitratorModel !== "deepseek-v4-pro"
    || config.blindAudit.fallbackMode !== "codex-in-session" || config.blindAudit.allowWebSearch
    || config.blindAudit.total !== 32) {
    throw new Error("Frozen blind-judge fallback chain or deblinding guard changed");
  }
}

export function experimentCells(): ExperimentCell[] {
  validateExperimentConfig();
  return EXPERIMENT_CONFIG.executionOrder.map((entry) => {
    const market = EXPERIMENT_CONFIG.markets.find((item) => item.countryCode === entry.countryCode);
    const details = categoryDetails[entry.categoryId as ExperimentCategoryId];
    if (!market || !details) throw new Error(`Unknown frozen cell ${entry.cellId}`);
    return { ...entry, countryCode: entry.countryCode as ExperimentCountryCode,
      categoryId: entry.categoryId as ExperimentCategoryId, countryName: market.countryName,
      primaryLanguage: market.primaryLanguage, supplementaryLanguages: [...market.supplementaryLanguages],
      categoryLabel: details.label, categoryDefinition: details.definition, roles: [...details.roles],
      armStartOrder: [...entry.armStartOrder] as ExperimentArm[] };
  });
}

export function cellById(cellId: string): ExperimentCell {
  const cell = experimentCells().find((item) => item.cellId === cellId);
  if (!cell) throw new Error(`Unknown experiment cell: ${cellId}`);
  return cell;
}

export function leadPlanForCell(cell: ExperimentCell): LeadSearchPlan {
  const targetCount = EXPERIMENT_CONFIG.sample.slotsPerArmPerCell;
  const userRequest = cell.primaryLanguage === "es"
    ? `Busca y evalúa ${targetCount} empresas en ${cell.countryName} cuya función principal sea ${cell.categoryLabel}. Limita la tarea a este mercado y esta categoría. Usa español y, cuando sea útil, inglés.`
    : `Find and evaluate ${targetCount} companies in ${cell.countryName} whose primary role is ${cell.categoryLabel}. Restrict the task to this market and category.`;
  return { countryCode: cell.countryCode, countryName: cell.countryName, objective: "new-market",
    roles: [...cell.roles], targetCount, queryLanguage: cell.primaryLanguage, userRequest,
    opportunityTargets: [], coverageMode: "auto", verifiedOnly: false };
}

export function primaryRoleMatchesCategory(primaryRole: string, categoryId: ExperimentCategoryId): boolean {
  return categoryDetails[categoryId].roles.includes(primaryRole as ChannelRole);
}

export function intentRolesRecognizeCategory(actual: ChannelRole[], expected: ChannelRole[]): boolean {
  const allowed = new Set(expected);
  return actual.some((role) => allowed.has(role));
}
