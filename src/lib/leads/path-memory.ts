import { tenantQuery } from "@/lib/rag/db";

import type { CompanyScaleClass, PrimaryBusinessRole } from "./workflow/types";
import type { CooperationPathType } from "@/lib/domain";

export interface CooperationPathMemory {
  selectedPathType: CooperationPathType;
  previousPathType?: CooperationPathType;
  primaryBusinessRole?: PrimaryBusinessRole;
  companyScaleClass?: CompanyScaleClass;
  marketCode?: string;
  developmentStage?: string;
  learnedAt: string;
}

export async function retrieveCooperationPathMemory(userId: string, workspaceId: string,
  marketCode: string, limit = 20): Promise<CooperationPathMemory[]> {
  const rows = await tenantQuery<{
    selected_path_type: CooperationPathType; previous_path_type: CooperationPathType | null;
    primary_business_role: PrimaryBusinessRole | null; company_scale_class: CompanyScaleClass | null;
    market_code: string | null; development_stage: string | null; created_at: string;
  }>(userId,
    `select selected_path_type, previous_path_type, primary_business_role, company_scale_class,
            market_code, development_stage, created_at::text
       from user_cooperation_path_edit
      where user_id=$1 and workspace_id=$2 and (market_code=$3 or market_code is null)
      order by created_at desc limit $4`,
    [userId, workspaceId, marketCode, limit]);
  return rows.map((row) => ({
    selectedPathType: row.selected_path_type,
    previousPathType: row.previous_path_type ?? undefined,
    primaryBusinessRole: row.primary_business_role ?? undefined,
    companyScaleClass: row.company_scale_class ?? undefined,
    marketCode: row.market_code ?? undefined,
    developmentStage: row.development_stage ?? undefined,
    learnedAt: row.created_at,
  }));
}
