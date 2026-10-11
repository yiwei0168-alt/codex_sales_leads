import {availableTools} from './tools';
import {productPrompt} from './product';
import {modePromptRules} from './mode-prompts';
import type {ExecutionContext,MessageInput,ModelConfig,ModelMessage} from './contracts';

/** Shared by production and replay preparation; decision memory is injected separately per turn. */
export function initialTaskMessages(context:Pick<ExecutionContext,'userId'|'role'|'mode'|'knowledgeScope'>,
 input:Pick<MessageInput,'content'|'attachments'|'knowledgeScope'>,config:ModelConfig,history:Array<{role:'user'|'assistant';content:string}>):ModelMessage[]{
 const knowledgeScope=input.knowledgeScope;
 return [{role:'system',content:context.mode
  ? `${modePromptRules(context.mode,config.profile?.promptVersion)}\n\n当前可用能力（完整参数执行前 describe_tool）：\n${availableTools(context).map(t=>`${t.id}: ${t.description}`).join('\n')}`
  : productPrompt(availableTools(context))},
  ...(knowledgeScope?.length?[{role:'system' as const,content:`This question came from the knowledge base. Search and cite only these selected knowledge collections: ${knowledgeScope.join(", ")}. Pass this exact list as knowledge_search.collections. Answer in the user's language and distinguish missing evidence from verified facts.`}]:[]),
  ...history.map(({role,content})=>({role,content})),
  {role:'user',content:input.content+(input.attachments.length?`\nAttached registered asset IDs: ${input.attachments.map(a=>a.assetId).join(', ')}`:'')}];
}
