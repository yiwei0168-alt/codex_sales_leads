export type V3UnitStatus = "success"|"blank"|"review-required"|"failed";
export type V3HumanUnitDecision = "accept-candidate"|"decorative-no-body";

export function deriveReleaseAssetState(units:Array<{status:V3UnitStatus;humanReviewDecision?:V3HumanUnitDecision}>):{
  processingStatus:"success"|"blank"|"review-required"|"failed";
  resolutionStatus:"pending"|"accepted";
  humanDecisionRequired:boolean;
}{
  const exceptional=units.filter(unit=>["review-required","blank","failed"].includes(unit.status));
  const allResolved=exceptional.every(unit=>Boolean(unit.humanReviewDecision));
  const processingStatus=units.some(unit=>unit.status==="failed")?"failed"
    :units.some(unit=>unit.status==="review-required")?"review-required"
    :units.length>0&&units.every(unit=>unit.status==="blank")?"blank":"success";
  return{processingStatus,resolutionStatus:exceptional.length&&!allResolved?"pending":"accepted",
    humanDecisionRequired:exceptional.length>0};
}
