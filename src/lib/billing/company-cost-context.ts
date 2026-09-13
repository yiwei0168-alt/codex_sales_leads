import {createHash} from "node:crypto";
import {currentSpendContext,withSpendContext} from "./context";
import type {CostAttribution} from "./cost-allocation";

export function costRoundKey(graphThreadId:string){
  if(!graphThreadId.trim())throw new Error("Cost round identity missing");
  return createHash("sha256").update(`lead-cost-round-v1:${graphThreadId}`).digest("hex");
}
/** Public identity + market only; no prompt, evidence, contact or credentials in metrics. */
export function companyCostKey(domain:string,countryCode:string){
  if(!/^[A-Z]{2}$/.test(countryCode))throw new Error("Cost attribution market missing");
  const url=new URL(`https://${domain}`);
  if(url.username||url.password||url.port||url.pathname!=="/"||url.search||url.hash)throw new Error("Invalid company domain");
  const host=url.hostname.toLowerCase().replace(/^www\./,"").replace(/\.$/,"");
  if(!host.includes(".")||!/^[a-z0-9.-]+$/.test(host))throw new Error("Invalid company domain");
  return createHash("sha256").update(JSON.stringify(["company-market-cost-v1",host,countryCode])).digest("hex");
}
export function withCompanyCostAttribution<T>(candidates:ReadonlyArray<{domain:string}>,countryCode:string,run:()=>T):T{
  const parent=currentSpendContext();if(!parent)return run();
  const companyKeys=[...new Set(candidates.map(candidate=>companyCostKey(candidate.domain,countryCode)))].sort();
  if(!companyKeys.length)throw new Error("Actual company inputs required");
  const costAttribution:CostAttribution={version:"company-cost-attribution-v1",kind:"company-inputs",
    roundKey:parent.costAttribution?.roundKey??null,companyKeys};
  return withSpendContext({...parent,costAttribution},run);
}
