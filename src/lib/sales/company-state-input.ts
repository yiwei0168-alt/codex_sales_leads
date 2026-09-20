import {z} from "zod";

const date=z.string().refine(value=>value===""||(/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))),"Invalid due date");

export const companyStatePatchSchema=z.object({
  primaryBusinessRole:z.enum(["Distributor","VAD","VAR","Dealer","Reseller","Retailer","E-tailer","SI","Installer","MSP","ISP","Agent","Brand Owner"]),
  selectedCooperationPath:z.enum(["Direct Tier-1 Supply","Distributor-Mediated Supply","Direct Downstream Channel Supply","OEM/ODM","Other"]),
  accountTier:z.enum(["Strategic Distributor","Priority Distributor","Standard Distributor","Long-tail Distributor","KA","Priority","Standard","Long-tail"]),
  supplyModel:z.enum(["Distributor Supply","Brand Direct","Co-sell/Co-supply","TBD"]),
  brandInvolvement:z.enum(["Light","Standard","Deep"]),
  opportunityStage:z.enum(["Discovered","Qualified","Priority","Contact Prepared","Engaged","Excluded","Contacted","Cooperating","Paused","Closed"]),
  priority:z.enum(["High","Medium","Low"]),
  owner:z.string().max(200),
  nextAction:z.string().max(2000),
  selectedPathId:z.string().max(80),
  nextActionDueAt:date,
}).partial().strict().refine(value=>Object.keys(value).length>0,"At least one company field required");

export function safeCompanyRevision(value:string|number):number{
  const revision=Number(value);
  if(!Number.isSafeInteger(revision)||revision<0)throw new Error("Company revision is outside safe integer range");
  return revision;
}
