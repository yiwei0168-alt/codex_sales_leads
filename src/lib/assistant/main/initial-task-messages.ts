import {availableTools,describeTool} from './tools';
import {hybridEnabled,suggestHybridRoute} from './hybrid-routing';
import {HYBRID_TOOLS} from './hybrid-contracts';
import {productPrompt} from './product';
import {modePromptRules} from './mode-prompts';
import type {ExecutionContext,MessageInput,ModelConfig,ModelMessage} from './contracts';

/** Shared by production and replay preparation; decision memory is injected separately per turn. */
export function initialTaskMessages(context:Pick<ExecutionContext,'userId'|'role'|'mode'|'knowledgeScope'|'evaluationArm'>,
 input:Pick<MessageInput,'content'|'attachments'|'knowledgeScope'>,config:ModelConfig,history:Array<{role:'user'|'assistant';content:string}>):ModelMessage[]{
 const knowledgeScope=input.knowledgeScope;
 const hybrid=hybridEnabled()&&!context.evaluationArm;
 const route=suggestHybridRoute(input.content,history.length>0,input.attachments.length>0);
 const hybridMessages:ModelMessage[]=hybrid?[{role:'system',content:
  `${!history.length&&!input.attachments.length&&!knowledgeScope?.length?'[hybrid-v2:eligible]':'[hybrid-v2]'}\n执行方式建议：${route.path}；${route.reason}\n这是可修改的执行建议，不裁剪用户的任何要求。高频单一读取优先 workflow_read；多对象读取、搜索、补证与评分的已知多步片段可用 programmatic_tools；本地只读兼容入口为 programmatic_read。先规划片段，再让代码循环、并发和聚合；需要理解新证据再决定策略时用 tools.handoff(reason,value) 交回主模型，之后可继续下一个程序片段。身份歧义、缺项、证据冲突或不完整范围需回到主模型，复用已有回执，不重做结果不明的操作。程序只能调用契约内工具，每个子调用保留原账户、模式、预算和回执控制。评分使用现有专用工具和政策，仍产生其模型调用；不得发布正式评分、写客户或发送邮件。最终答案仍由当前选定模型给出，必须交代覆盖范围、未解决要求并引用原始证据。以下编排入口的完整契约已经提供，可直接 execute_tool；其他叶工具仍按需 describe_tool：\n${availableTools(context).filter(t=>HYBRID_TOOLS.some(id=>id===t.id)).map(t=>JSON.stringify(describeTool(t))).join('\n')}`}]:[];
 return [{role:'system',content:context.mode
  ? `${modePromptRules(context.mode,config.profile?.promptVersion)}\n\n当前可用能力（完整参数执行前 describe_tool）：\n${availableTools(context).map(t=>`${t.id}: ${t.description}`).join('\n')}`
  : productPrompt(availableTools(context))},
  ...hybridMessages,
  ...(knowledgeScope?.length?[{role:'system' as const,content:`This question came from the knowledge base. Search and cite only these selected knowledge collections: ${knowledgeScope.join(", ")}. Pass this exact list as knowledge_search.collections. Answer in the user's language and distinguish missing evidence from verified facts.`}]:[]),
  ...history.map(({role,content})=>({role,content})),
  {role:'user',content:input.content+(input.attachments.length?`\nAttached registered asset IDs: ${input.attachments.map(a=>a.assetId).join(', ')}`:'')}];
}
