export interface TariffDates {verifiedAt:string;expiresAt:string;promotionEndsAt?:string}

/** Same seven-day and promotion limits used by the pre-network gate. */
export function tariffValidity(rule:TariffDates,now=Date.now()) {
  const verified=Date.parse(rule.verifiedAt),expires=Date.parse(rule.expiresAt);
  const promotion=rule.promotionEndsAt===undefined?Infinity:Date.parse(rule.promotionEndsAt);
  const deadline=Math.min(expires,verified+7*24*60*60*1000,promotion);
  const valid=Number.isFinite(now)&&Number.isFinite(verified)&&Number.isFinite(expires)
    &&!Number.isNaN(promotion)&&verified<=now&&now<deadline;
  return {withinVerificationWindow:valid,effectiveExpiresAt:Number.isFinite(deadline)?new Date(deadline).toISOString():null};
}
