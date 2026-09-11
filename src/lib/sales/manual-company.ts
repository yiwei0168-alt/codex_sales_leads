import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { CompanyRecord } from "@/lib/domain";
import { tenantTransaction } from "@/lib/rag/db";
import { marketLabel } from "./market-navigation";

export const manualCompanySchema=z.object({
  name:z.string().trim().min(2).max(200),country:z.string().regex(/^[A-Z]{2}$/),
  website:z.string().trim().max(400).default(""),
  role:z.enum(["Distributor","VAD","VAR","Dealer","Reseller","Retailer","E-tailer","SI","Installer","MSP","ISP","Agent","Brand Owner"]).optional(),
}).strict();

export function manualDomain(website:string):string {
  if(!website)return "";
  const url=new URL(/^https?:\/\//i.test(website)?website:`https://${website}`);
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password||!url.hostname.includes("."))throw new Error("请输入有效官网域名");
  return url.hostname.toLowerCase().replace(/^www\./,"");
}

export async function addManualCompany(userId:string,input:z.infer<typeof manualCompanySchema>) {
  const domain=manualDomain(input.website);
  return tenantTransaction(userId,async client=>{
    const workspaces=await client.query<{id:string}>(`select id from market_workspace where owner_id=$1 and slug='global-sales' and status='active' for update`,[userId]);
    const workspace=workspaces.rows[0];if(!workspace)throw new Error("请先建立工作区");
    const duplicates=await client.query<{external_id:string}>(`select c.external_id from sales_company c join workspace_company wc on wc.company_id=c.id
      where wc.workspace_id=$1 and (($3<>'' and lower(c.domain)=lower($3)) or
      (coalesce(wc.market_country_code,c.country_code)=$2 and lower(coalesce(wc.user_overrides->>'displayName',c.canonical_name))=lower($4))) limit 1`,[workspace.id,input.country,domain,input.name]);
    if(duplicates.rows[0])return {duplicate:true,externalId:duplicates.rows[0].external_id};
    const id=`manual-${randomUUID()}`;
    const distributor=input.role==="Distributor"||input.role==="VAD";
    const record:CompanyRecord={id,legalName:input.name,displayName:input.name,domain,city:"",country:marketLabel(input.country),
      layer:distributor?"Tier-1 Distributor":"Downstream Channel",roles:input.role?[input.role]:[],primaryBusinessRole:input.role??"Unresolved",
      accountTier:distributor?"Standard Distributor":"Standard",supplyModel:"TBD",brandInvolvement:"Standard",fitScore:0,accountValue:0,
      reachability:0,evidenceConfidence:0,summary:"用户添加，尚未核实与评分",opportunityStage:"Discovered",priority:"Low",owner:"Unassigned",
      nextAction:"核实公司信息",risks:[],unknowns:["尚未核实公司身份、角色及产品匹配"],evidence:[],manuallyEdited:true,assessmentNeedsRefresh:true,userAdded:true};
    const result=await client.query<{id:string;external_id:string}>(`insert into sales_company(external_id,canonical_name,domain,country_code,source_kind,record)
      values($1,$2,$3,$4,'user-added',$5) on conflict(lower(domain)) do update set domain=sales_company.domain returning id,external_id`,
      [id,input.name,domain||`${id}.invalid`,input.country,JSON.stringify(record)]);
    const company=result.rows[0];record.id=company.external_id;
    await client.query(`insert into workspace_company(workspace_id,company_id,account_tier,supply_model,brand_involvement,opportunity_stage,priority,
      market_country_code,manually_edited,user_overrides) values($1,$2,$3,'TBD','Standard','Discovered','Low',$4,true,$5)
      on conflict(workspace_id,company_id) do nothing`,[workspace.id,company.id,record.accountTier,input.country,JSON.stringify(record)]);
    await client.query(`insert into workspace_audit_event(workspace_id,actor_user_id,entity_type,entity_id,action,changes)
      values($1,$2,'company',$3,'company.manually-added',$4)`,[workspace.id,userId,record.id,JSON.stringify({country:input.country,source:"user",evaluated:false,
      efficiency:{inputItems:1,validOutputItems:1,downstreamUsedItems:1,inputTokens:0,outputTokens:0,costUsd:0,paidSearchCredits:0,retries:0,discardedReasonCounts:{},optimizationOpportunity:"Reuse candidate before paid discovery"}})]);
    return {duplicate:false,externalId:record.id,company:record};
  });
}
