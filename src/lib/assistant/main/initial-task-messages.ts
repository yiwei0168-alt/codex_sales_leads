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
  `${!history.length&&!input.attachments.length&&!knowledgeScope?.length?'[hybrid-v1:eligible]':'[hybrid-v1]'}\n执行方式建议：${route.path}；${route.reason}\n这是可修改的建议，不是用户意图分类或任务范围。保留原始问题的所有要求。高频单一读取优先 workflow_read；多对象、分页、过滤和数据组合可用 programmatic_read；语义复杂、条件不明和其他操作保留普通动态工具。遇到身份歧义、缺项、证据冲突或不完整范围时转回动态规划，复用已读结果，不重做结果不明的操作。批量程序只能调用明确列出的本地只读工具，不能发送、评分或外部搜索。最终答案仍由当前选定模型给出，必须交代覆盖范围、未解决要求并引用原始证据。以下两个入口的完整契约已经提供，可直接 execute_tool；其他叶工具仍按需 describe_tool：\n${availableTools(context).filter(t=>HYBRID_TOOLS.some(id=>id===t.id)).map(t=>JSON.stringify(describeTool(t))).join('\n')}`}]:[];
 return [{role:'system',content:context.mode
  ? `${modePromptRules(context.mode,config.profile?.promptVersion)}\n\n当前可用能力（完整参数执行前 describe_tool）：\n${availableTools(context).map(t=>`${t.id}: ${t.description}`).join('\n')}`
  : productPrompt(availableTools(context))},
  ...hybridMessages,
  ...(knowledgeScope?.length?[{role:'system' as const,content:`This question came from the knowledge base. Search and cite only these selected knowledge collections: ${knowledgeScope.join(", ")}. Pass this exact list as knowledge_search.collections. Answer in the user's language and distinguish missing evidence from verified facts.`}]:[]),
  ...history.map(({role,content})=>({role,content})),
  {role:'user',content:input.content+(input.attachments.length?`\nAttached registered asset IDs: ${input.attachments.map(a=>a.assetId).join(', ')}`:'')}];
}
