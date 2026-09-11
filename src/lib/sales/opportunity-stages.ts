import type { OpportunityStage } from "@/lib/domain";
export const opportunityStages: Array<[OpportunityStage,string]> = [
  ["Qualified","待开发"],["Priority","准备中"],["Contacted","已联系"],["Engaged","沟通中"],
  ["Cooperating","合作中"],["Paused","暂缓"],["Closed","已关闭"],
];
export function stageLabel(stage:OpportunityStage):string {
  if(stage==="Discovered")return "未加入开发";
  if(stage==="Excluded")return "已移出";
  if(stage==="Contact Prepared")return "准备中";
  return opportunityStages.find(([value])=>value===stage)?.[1]??stage;
}
export function afterSuccessfulSend(stage:OpportunityStage):OpportunityStage {
  return ["Discovered","Qualified","Priority","Contact Prepared"].includes(stage)?"Contacted":stage;
}
