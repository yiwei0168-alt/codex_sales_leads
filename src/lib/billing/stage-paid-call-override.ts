export const CURRENT_STAGE_PAID_CALL_OVERRIDE_RULE = "A29" as const;

export interface CurrentStagePaidCallOverride {
  ruleId: typeof CURRENT_STAGE_PAID_CALL_OVERRIDE_RULE;
  allowBudgetOverage: true;
  allowUnknownReplay: true;
}

/**
 * Temporary, process-scoped admission for the explicitly named owner.
 * It never supplies a tariff, bypasses a frozen account, or clears billing history.
 */
export function currentStagePaidCallOverride(userId: string): CurrentStagePaidCallOverride | null {
  if (process.env.PAID_CALL_STAGE_OVERRIDE?.trim() !== CURRENT_STAGE_PAID_CALL_OVERRIDE_RULE) return null;
  if (process.env.PAID_CALL_STAGE_OVERRIDE_USER_ID?.trim() !== userId) return null;
  return { ruleId: CURRENT_STAGE_PAID_CALL_OVERRIDE_RULE, allowBudgetOverage: true, allowUnknownReplay: true };
}
