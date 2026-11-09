import {type RouteState, type routeNames} from '@/providers/decision-contract';
type Route = typeof routeNames[number];
type Family = {id:string;split:'development'|'holdout';expected:Route;prompt:(company:string)=>string;flags?:Partial<RouteState>};
// Synthetic regression fixtures only. Family split prevents paraphrases of a development
// template appearing in holdout; these are NOT independent business Gold samples.
const families:Family[]=[
  {id:'recent',split:'development',expected:'fixed_workflow',prompt:c=>`请帮我看一下 ${c} 最近的客户进展。`},
  {id:'knowledge',split:'development',expected:'fixed_workflow',prompt:c=>`在已入库资料里查找 ${c} 的产品规格证据。`},
  {id:'discovery',split:'development',expected:'dynamic_agent',prompt:c=>`搜索英国各类渠道各3家公司，包括 ${c} 的同类公司，完成分渠道搜索、多轮补证和评分。`},
  {id:'mixed',split:'development',expected:'dynamic_agent',prompt:c=>`查看 ${c} 的最新进展，再写一封英文跟进邮件并发送给联系人。`},
  {id:'local-batch',split:'development',expected:'interpreter',prompt:c=>`只读本地已保存资料，逐家查询 ${c}、Atlas、Birch 的客户时间线，汇总最近联系日期，不上网。`},
  {id:'local-pagination',split:'development',expected:'interpreter',prompt:c=>`对本地 ${c} 的已入库邮件分页读取，按月份统计数量。只读，不同步，不评分。`},
  {id:'followup',split:'development',expected:'uncertain',prompt:()=>`按刚才的条件再查另一家公司。`,flags:{hasHistory:true}},
  {id:'attachment',split:'development',expected:'uncertain',prompt:c=>`按照附件里的特殊要求处理 ${c}，不要漏掉任何一项。`,flags:{hasAttachments:true}},
  {id:'recent-paraphrase',split:'holdout',expected:'fixed_workflow',prompt:c=>`${c} 近期沟通到哪一步了？仅查看现有记录。`},
  {id:'knowledge-paraphrase',split:'holdout',expected:'fixed_workflow',prompt:c=>`帮我从现有知识库找出 ${c} 接口规格的原文出处。`},
  {id:'negated-write',split:'holdout',expected:'dynamic_agent',prompt:c=>`不要只总结 ${c} 最近进展，要对照去年合同逐项找差异并起草回复。不要发送。`},
  {id:'external-batch',split:'holdout',expected:'dynamic_agent',prompt:c=>`批量搜索 ${c} 等英国公司的官网及渠道信息，为每家补证并评分。`},
  {id:'local-filter',split:'holdout',expected:'interpreter',prompt:c=>`从本地存量记录中筛选 ${c}、Cedar 和Dawn近30天有邮件的公司，逐家列出最新记录的引用，不联网不改数据。`},
  {id:'local-aggregate',split:'holdout',expected:'interpreter',prompt:c=>`仅查询本地数据，比较 ${c}、Elm 和Fir的邮件往来次数，按次数排序并保留原始记录引用。`},
  {id:'ambiguous',split:'holdout',expected:'uncertain',prompt:c=>`那个 ${c} 就按我们之前商量的办吧。`,flags:{hasHistory:true}},
  {id:'policy',split:'holdout',expected:'uncertain',prompt:c=>`依照我保存的特殊客户政策处理 ${c} 的事情。`,flags:{hasPolicy:true}},
];
const companies=['Northstar','northstar.example','北星科技','Northstar Distribution Ltd','Cedar Networks','cedar.example','青杉网络','Cedar GmbH'];
export const decisionRoutingSamples=families.flatMap(family=>companies.map((company,index)=>({
  id:`${family.id}-${index+1}`,family:family.id,split:family.split,expected:family.expected,
  state:{request:family.prompt(company),hasHistory:false,hasAttachments:false,hasPolicy:false,hasKnowledgeScope:false,...family.flags} as RouteState,
})));
