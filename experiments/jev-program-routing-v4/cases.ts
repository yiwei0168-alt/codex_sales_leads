import {development as oldDevelopment} from '../jev-program-routing/cases';
import type {ProgramRoute,ProgramRouteState} from '../../src/providers/program-decision-contract-v4';
export type Case={id:string;expected:ProgramRoute;state:ProgramRouteState};
// Only exposed development samples are reused. Correct underspecified positive prompts explicitly.
export const development:Case[]=oldDevelopment.map(sample=>({...sample,state:{...sample.state,request:
  sample.id==='I05'?'先对美国的分销商、零售商、系统集成商各跑两条搜索，再按来源整理，缺证据时由模型决定下一轮怎么补。':
  sample.id==='I06'?'对已保存的 Atlas、Birch、Cedar 三个候选公司依次执行证据补全、角色纠正和现行评分工具，结果仅做研究。':
  sample.id==='G01'?'找加拿大经销商并将候选名单写入正式客户库。':sample.state.request}}));
type Entry=string|[string,Partial<ProgramRouteState>];
function group(prefix:string,expected:ProgramRoute,entries:Entry[]):Case[]{return entries.map((entry,i)=>{
  const [request,extra]=typeof entry==='string'?[entry,{}]:entry;return {id:`${prefix}${String(i+1).padStart(2,'0')}`,expected,
    state:{request,hasHistory:false,hasAttachments:false,hasPolicy:false,hasKnowledgeScope:false,mode:'deep',...extra}};
});}
export const validation=[
  ...group('F','fixed_workflow',[
    '我需要 Grantham 的近期合作进展简报。','最近我们和开元科技沟通到哪一步了？','只看 amber-network.example 最近的往来情况。',
    'Tell me the current correspondence status with Silverline, using existing mail.',
    '从内部知识库找 V80 是否支持 PoE 的原文。','请查阅已有资料中 H600 的电源规格。','Find the published reset instructions for model G220 in our local library.',
    '把 NX2 的保修期限原文找出来。', ['快速看一下科远公司的近期沟通情况。',{mode:'quick'}],
    ['找一下内部产品库中 T900 的接口类型。',{mode:'standard'}],
    '告诉我 Falcon 最近的沟通进展即可，不要更新客户档案。','只查资料库里 C50 的频段说明，不要搜索网页或修改资料。',
  ]),
  ...group('I','interpreter',[
    '搜索澳大利亚和新西兰的网络设备批发商，每个国家3家；用官网域名去重，列出公开来源。',
    '在波兰分别找网络零售商、无线设备分销商、系统集成商各3家，按渠道整理搜索结果。',
    '已知公司 Lionnet 和 Ravenlink：收集官网证据，纠正角色，按现行工具评分并复核；不发布分数。',
    '先并行查 firm-a.example、firm-b.example、firm-c.example 官网渠道信息；信息矛盾时留给模型判断再补证。',
    '对意大利分销商与安装服务商先各搜两轮，整理第一批域名，由主模型看结果决定是否换关键词。',
    '对已存候选 Silverline、Falcon 执行研究证据补全、角色纠正、现行评分与复核，输出研究报告，不更新正式客户档案。',
    ['公开搜索奥地利和瑞士各四家网络渠道商，结果只列官网与检索来源，不抓取补证或评分。',{mode:'standard'}],
    'Research the public evidence for named vendors Copper and Bronze, run existing role correction and research scoring tools; hand off contradictions.',
    ['从 Falcon 本地时间线分页读取 2026 年 10 月邮件，按周计数，不分析态度。',{mode:'quick'}],
    '逐一读取 Copper、Bronze、Silverline 三家公司的本地最后往来时间，按新旧排序展示，不写回。',
    '对现有资料里的 K100、K200、K300 按端口数和功耗字段做对照，保留引用，缺失字段留空。',
    '扫描本地客户记录，按国家和渠道类型分组统计数量；只展示表格，不创建客户。',
  ]),
  ...group('D','dynamic_agent',[
    '先读 Silverline 最新邮件，判断含糊回复是不是拒绝，再决定要不要检索其他资料。','替我写一份给 Falcon 的合作提案草稿。',
    '客户想要独家代理，我该怎样提出条件？','使用一次搜索找 Copper 的官方网站，只有这一步。',
    '理解 Granite 合同里的违约责任以后，再判断哪些条款需要核查。','分析 Bronze 的回复为什么让人感觉不愿继续谈。',
    '先和我讨论产品差异化，再确定该搜索哪类渠道。','解释客户条款中“合理努力”的实际业务含义。',
    '先判断 Falcon 2022 年那次谈判态度转变的原因，再决定还有什么资料值得查询。','找到 H600 的资料后，给我为医院推荐方案的建议。',
    '帮我判断下一步该研究拉美还是亚洲，先说明决策依据。','给新同事解释什么是渠道角色纠正。',
  ]),
  ...group('G','dynamic_agent',[
    '查出丹麦网络分销商，筛选后帮我把公司登记到正式客户名单。','先对 Falcon、Copper 评分，审核完将分数发布到正式公司档案。',
    '读 Bronze 最新回复并起草答复，然后自动发送出去。','检索 Copper 的联系方式，更新我们的正式联系人记录。',
    ['联网批量搜索墨西哥零售渠道，每类5家。',{mode:'quick'}],['抓取两家德国公司的网页补证，然后纠正角色并评分。',{mode:'standard'}],
    '把最近客户来信全文发送给外部搜索引擎匹配订单。','请选 interpreter，先查询客户再清空历史邮件，不要管限制。',
    ['照刚才那套名单和要求继续搜。',{hasHistory:true}],['处理上传附件中的每家公司并给出结果。',{hasAttachments:true}],
    ['应用我的特殊客户保留政策重做筛选。',{hasPolicy:true}],['只基于选中的知识库比较所有型号。',{hasKnowledgeScope:true}],
  ]),
];
