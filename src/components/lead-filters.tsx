"use client";
import { useState } from "react";
import type { CompanyRecord,CooperationPathType,OpportunityStage } from "@/lib/domain";
import { evidenceFreshness } from "@/lib/sales/evidence-freshness";
import { opportunityStages } from "@/lib/sales/opportunity-stages";
import { BulkCompanyActions } from "./bulk-company-actions";
import type { CompanyEditablePatch } from "@/lib/sales/types";
export function LeadFilters({companies,children,onUpdate}:{companies:CompanyRecord[];children:(items:CompanyRecord[])=>React.ReactNode;onUpdate:(id:string,patch:CompanyEditablePatch)=>Promise<boolean>}){
  const [section,setSection]=useState("all");const [stage,setStage]=useState("all");const [minimum,setMinimum]=useState(0);
  const [path,setPath]=useState("all");const [fresh,setFresh]=useState("all");const [sort,setSort]=useState("score");
  const rows=companies.filter(company=>company.opportunityStage!=="Excluded"&&(company.assessmentEligible!==false||company.assessmentNeedsRefresh))
    .filter(company=>section==="all"||(section==="review")===Boolean(company.assessmentNeedsRefresh||company.assessmentEligible!==true))
    .filter(company=>stage==="all"||company.opportunityStage===stage as OpportunityStage)
    .filter(company=>minimum===0||!company.assessmentNeedsRefresh&&company.fitScore>=minimum)
    .filter(company=>path==="all"||(path==="none"?!company.selectedCooperationPath:company.selectedCooperationPath===path as CooperationPathType))
    .filter(company=>fresh==="all"||evidenceFreshness(company.evidence)===fresh)
    .sort((a,b)=>sort==="name"?a.displayName.localeCompare(b.displayName):sort==="evidence"?latest(b)-latest(a):sort==="updated"?timestamp(b.updatedAt)-timestamp(a.updatedAt):sort==="created"?timestamp(b.recordCreatedAt)-timestamp(a.recordCreatedAt):b.fitScore-a.fitScore);
  function timestamp(value:string|undefined){const time=Date.parse(value??"");return Number.isFinite(time)?time:0;}
  function latest(company:CompanyRecord){return Math.max(0,...company.evidence.map(item=>Date.parse(item.capturedAt)).filter(Number.isFinite));}
  return <><div className="results-toolbar"><label>资格分区<select value={section} onChange={event=>setSection(event.target.value)}><option value="all">全部存量</option><option value="qualified">评分可用</option><option value="review">待核实 / 待重评</option></select></label>
    <label>开发阶段<select value={stage} onChange={event=>setStage(event.target.value)}><option value="all">全部阶段</option><option value="Discovered">未加入开发</option>{opportunityStages.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <details><summary>高级筛选与排序</summary><label>最低评分<input type="number" min={0} max={100} value={minimum} onChange={event=>setMinimum(Number(event.target.value))}/></label>
      <label>合作路径<select value={path} onChange={event=>setPath(event.target.value)}><option value="all">全部路径</option><option value="none">未分析</option>{[...new Set(companies.flatMap(item=>item.selectedCooperationPath?[item.selectedCooperationPath]:[]))].map(value=><option key={value}>{value}</option>)}</select></label>
      <label>核实新鲜度<select value={fresh} onChange={event=>setFresh(event.target.value)}><option value="all">全部</option><option value="current">一年内核实</option><option value="older-than-year">超过一年</option><option value="unknown">日期未知</option></select></label>
      <label>排序<select value={sort} onChange={event=>setSort(event.target.value)}><option value="score">评分降序</option><option value="name">公司名称</option><option value="evidence">证据采集时间</option><option value="created">公司记录创建时间</option><option value="updated">工作区更新时间</option></select></label>
    </details></div><BulkCompanyActions companies={rows} onUpdate={onUpdate}/>{children(rows)}</>;
}
