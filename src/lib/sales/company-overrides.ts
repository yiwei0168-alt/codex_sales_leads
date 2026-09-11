import type { CompanyRecord } from "@/lib/domain";
import type { CompanyEditablePatch } from "./types";

export function companyOverride(current: CompanyRecord, patch: CompanyEditablePatch): Partial<CompanyRecord> {
  const result: Partial<CompanyRecord> = {};
  if (patch.primaryBusinessRole !== undefined && patch.primaryBusinessRole !== current.primaryBusinessRole) {
    const role = patch.primaryBusinessRole;
    if (role === "Hybrid" || role === "Unresolved") throw new Error("请选择明确的主角色");
    const distributor = role === "Distributor" || role === "VAD";
    result.primaryBusinessRole = role;
    result.roles = [role, ...current.roles.filter((item) => item !== role)];
    result.layer = distributor ? "Tier-1 Distributor" : role === "Agent" || role === "Brand Owner" ? "Strategic Partner" : "Downstream Channel";
    result.assessmentNeedsRefresh = true;
    if (distributor !== current.accountTier.endsWith("Distributor")) {
      result.accountTier = distributor ? "Standard Distributor" : "Standard";
    }
  }
  if (patch.accountTier !== undefined) {
    const layer = result.layer ?? current.layer;
    if ((layer === "Tier-1 Distributor") !== patch.accountTier.endsWith("Distributor")) {
      throw new Error("账户等级与主角色不兼容，一级分销商不能使用KA等级");
    }
    result.accountTier = patch.accountTier;
  }
  if (patch.selectedCooperationPath !== undefined) {
    result.selectedCooperationPath = patch.selectedCooperationPath;
    result.selectedPathId = "user-selected";
  }
  return result;
}
