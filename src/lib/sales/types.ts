import type { CompanyRecord } from "@/lib/domain";

export interface MarketWorkspaceDto {
  id: string;
  slug: string;
  name: string;
  market: string;
  countryCode: string;
  mode: "new-market" | "growth";
  objective: string;
  companies: CompanyRecord[];
  latestSearch?: {
    provider: string;
    acceptedCount: number;
    creditsUsed: number;
    finishedAt: string;
  };
}

export type CompanyEditablePatch = Partial<Pick<CompanyRecord,
  "accountTier" | "supplyModel" | "brandInvolvement" | "opportunityStage" | "priority" | "owner" | "nextAction"
>>;
