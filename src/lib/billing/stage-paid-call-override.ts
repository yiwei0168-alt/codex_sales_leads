export const CURRENT_STAGE_PAID_CALL_OVERRIDE_RULE = "A33" as const;

export interface CurrentStagePaidCallOverride {
  ruleId: typeof CURRENT_STAGE_PAID_CALL_OVERRIDE_RULE;
  allowBudgetOverage: true;
  allowUnknownReplay: true;
  allowFinancialAdmissionBypass: true;
}

/**
 * Temporary, process-scoped admission for the explicitly named owner.
 * It bypasses only local financial admission for the exact configured owner.
 * Authentication, disclosure controls, replay safety and billing history remain enforced.
 */
export function currentStagePaidCallOverride(userId: string): CurrentStagePaidCallOverride | null {
  if (process.env.PAID_CALL_STAGE_OVERRIDE?.trim() !== CURRENT_STAGE_PAID_CALL_OVERRIDE_RULE) return null;
  if (process.env.PAID_CALL_STAGE_OVERRIDE_USER_ID?.trim() !== userId) return null;
  return { ruleId: CURRENT_STAGE_PAID_CALL_OVERRIDE_RULE, allowBudgetOverage: true, allowUnknownReplay: true,
    allowFinancialAdmissionBypass: true };
}
