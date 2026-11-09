import {z} from 'zod';
import {modeConfigSchema, modeModelConfig} from './mode-config';
import type {ModelConfig, ModelMessage} from './contracts';
import content from './mode-prompt-content.json';
import {KNOWLEDGE_RESPONSE_POLICY} from './knowledge-response-policy';
import {RESPONSE_RESPONSIBILITY_POLICY} from './response-readability-policy';

export const AUTOMATIC_EXECUTION_VERSION = 'hybrid-auto-v1';
export const automaticConfigSchema = z.object({
  version: z.literal(AUTOMATIC_EXECUTION_VERSION),
  capabilityMode: z.enum(['deep','quick']),
  profiles: z.object({fixed_workflow: modeConfigSchema, interpreter: modeConfigSchema, dynamic_agent: modeConfigSchema}).strict(),
}).strict();
export type AutomaticExecutionConfig = z.infer<typeof automaticConfigSchema>;
export type AutomaticRoute = keyof AutomaticExecutionConfig['profiles'];

/** Pin the model choices at enqueue time; a router suggestion never grants permissions. */
export function automaticModelConfig(scope: 'business'|'knowledge' = 'business'): ModelConfig {
  const base = modeModelConfig(scope === 'knowledge' ? 'quick' : 'deep');
  return {...base, automatic: automaticConfigSchema.parse({version: AUTOMATIC_EXECUTION_VERSION,
    capabilityMode: scope === 'knowledge' ? 'quick' : 'deep', profiles: {
      fixed_workflow: modeModelConfig('quick').profile,
      interpreter: modeModelConfig('standard').profile,
      dynamic_agent: modeModelConfig('deep').profile,
    }})};
}

/** Read only server-authored advice / paired tool receipts, never user text or tool prose. */
export function automaticRoute(messages: ModelMessage[], revision = 0): AutomaticRoute {
  if (revision > 0) return 'dynamic_agent';
  let route: AutomaticRoute = 'dynamic_agent';
  for (const message of messages) {
    if (message.role === 'system') {
      const match = /^\[jev-program-routing-v(?:4|7)\] 建议 (fixed_workflow|interpreter|dynamic_agent)。/.exec(message.content ?? '');
      if (match) route = match[1] as AutomaticRoute;
    }
  }
  const calls = new Map<string, string>();
  for (const message of messages) if (message.role === 'assistant') for (const call of message.tool_calls ?? []) {
    if (call.function.name !== 'execute_tool') continue;
    try {
      const tool = JSON.parse(call.function.arguments).tool;
      if (typeof tool !== 'string') return 'dynamic_agent';
      calls.set(call.id, tool);
      if (/^hybrid_route_[a-f0-9]{32}$/.test(call.id) && tool === 'workflow_read') route = 'fixed_workflow';
    } catch { return 'dynamic_agent'; }
  }
  for (const message of messages) if (message.role === 'tool') {
    try {
      const output = JSON.parse(message.content ?? '');
      if (output.status !== 'success' || output.data?.handoff) return 'dynamic_agent';
    } catch { return 'dynamic_agent'; }
  }
  if (route === 'fixed_workflow' && [...calls.values()].some(tool => tool !== 'workflow_read')) return 'dynamic_agent';
  return route;
}

export function automaticModelSelection(config: ModelConfig, messages: ModelMessage[], revision = 0) {
  if (!config.automatic) return null;
  const automatic = automaticConfigSchema.parse(config.automatic);
  const route = automaticRoute(messages, revision);
  return {route, profile: automatic.profiles[route], version: automatic.version};
}

/** Versioned independently; historical manual-mode prompts remain unchanged. */
export function automaticPromptRules(config: AutomaticExecutionConfig): string {
  const automatic = automaticConfigSchema.parse(config);
  const common = content.common.replace(
    '9. 工具或模式能力不足时，说明具体缺口和可保留的结果，提出切换模式建议，等待用户选择，不自动升级。只有缺少完成任务必需的信息时才澄清。',
    '9. 新任务由系统自动选择执行方式和模型，不要求用户选择快速问答、标准工作或深入研究。执行方式或模型切换不代表授权；能力不足时说明具体缺口，只有缺少必需信息时才澄清。');
  const scope = automatic.capabilityMode === 'quick'
    ? '本入口限定为知识资料只读问答；不得发起外部搜索、同步、写入或发送。需要其他业务动作时请用户在业务对话中提出，不要求选择模型或模式。'
    : `${content.deep}\n日常邮件、客户维护、同步和草稿任务也可按用户要求使用获准工具。同步排队不等于完成；草稿不等于已发送；发送、删除、正式发布继续遵守既有确认。不要因为内部模型档位为 quick 或 standard 而让用户切换模式；可用工具由服务器提供，权限与审批逐次检查。`;
  return `[${automatic.version}] 自动执行\n${common}\n\n${scope}\n\n${KNOWLEDGE_RESPONSE_POLICY}\n\n${RESPONSE_RESPONSIBILITY_POLICY}`;
}
