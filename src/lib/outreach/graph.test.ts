import { describe, expect, it, vi } from "vitest";

import { buildDevelopmentStrategyGraph } from "./graph";
import type { DevelopmentContext } from "./types";

describe("development strategy graph", () => {
  it("loads context, invokes Kimi and persists the validated draft", async () => {
    const context = { userId: "user", workspaceId: "workspace", companyId: "company-db",
      company: { id: "company" }, knowledge: [], templates: [] } as unknown as DevelopmentContext;
    const generated = {
      strategy: { objective: "Objective", personalizationAngle: "Angle", valuePropositions: ["Value"],
        recommendedProducts: [], targetTitles: ["Director"], likelyObjections: [], callToAction: "Call",
        followUpPlan: ["Follow"], evidenceIds: [], knowledgeIds: [] },
      draft: { language: "en", subjectOptions: ["Subject"], body: "Body", wordCount: 1, placeholders: [] },
      evidenceIds: [], knowledgeIds: [], templateIds: [], warnings: [], model: "kimi-k3", promptVersion: "v1",
    };
    const result = { ...generated, id: "draft", companyExternalId: "company", status: "generated" as const,
      revision: 1, createdAt: "2026-08-24", recipient: undefined };
    const dependencies = {
      loadContext: vi.fn().mockResolvedValue(context),
      generate: vi.fn().mockResolvedValue(generated),
      persist: vi.fn().mockResolvedValue(result),
    };
    const state = await buildDevelopmentStrategyGraph(dependencies).invoke({
      userId: "user", options: { companyExternalId: "company" },
    });
    expect(state.result).toEqual(result);
    expect(dependencies.loadContext).toHaveBeenCalledOnce();
    expect(dependencies.generate).toHaveBeenCalledOnce();
    expect(dependencies.persist).toHaveBeenCalledOnce();
  });
});
