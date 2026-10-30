import {z} from 'zod';
import type {LeadSearchPlan} from '@/lib/assistant/types';
import type {ChannelRole} from '@/lib/domain';
import {buildHybridSearchRoute,normalizeLeadSearchPlan,type LeadSearchCategory} from './hybrid-search-policy';

export const STANDARD_ACCEPTANCE_GROUPS: ReadonlyArray<{
 category:LeadSearchCategory;label:string;roles:ChannelRole[];
}>=[
 {category:'distribution',label:'分销渠道',roles:['Distributor','VAD']},
 {category:'resale',label:'B2B 转售渠道',roles:['VAR','Dealer','Reseller']},
 {category:'retail',label:'零售与电商',roles:['Retailer','E-tailer']},
 {category:'si-msp',label:'系统集成与托管服务',roles:['SI','MSP']},
 {category:'installer',label:'安装工程渠道',roles:['Installer']},
 {category:'isp',label:'运营商渠道',roles:['ISP']},
];

/** Uses merged production categories and market-dependent tracks, without subtype
 * quotas or injecting Agent, Brand Owner or OEM opportunities into the request. */
export function buildStrategyAcceptancePlans(input:{countryCode:string;countryName:string;targetPerGroup:number;userRequest:string}){
 const value=z.object({countryCode:z.string().regex(/^[A-Z]{2}$/),countryName:z.string().min(2).max(120),
  targetPerGroup:z.number().int().min(1).max(100),userRequest:z.string().min(2).max(2000)}).strict().parse(input);
 return STANDARD_ACCEPTANCE_GROUPS.map((group,index)=>{
  const plan:LeadSearchPlan=normalizeLeadSearchPlan({countryCode:value.countryCode,countryName:value.countryName,
   objective:'new-market',roles:[...group.roles],targetCount:value.targetPerGroup,queryLanguage:'English',coverageMode:'auto',
   userRequest:`${value.userRequest}\nSearch category: ${group.category}; supported role scope: ${group.roles.join(', ')}. Target ${value.targetPerGroup} finally qualified companies across this merged category, with no quota per role subtype. Use the existing market-dependent hybrid search policy and public company evidence.`});
  const route=buildHybridSearchRoute(plan);
  if(route.some(step=>step.category!==group.category))throw Error('Acceptance category differs from production route');
  return {caseId:`SG-${String(index+1).padStart(2,'0')}`,category:group.category,label:group.label,plan,
   tracks:[...new Set(route.map(step=>step.track))]};
 });
}
