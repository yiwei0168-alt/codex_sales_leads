/** Shared by the composer, request validation and server model profile. */
export const AGENT_MODES = ['quick', 'standard', 'deep'] as const;
export type AgentMode = typeof AGENT_MODES[number];
export const DEFAULT_AGENT_MODE: AgentMode = 'standard';
export const agentModeOptions: ReadonlyArray<{value: AgentMode; label: string; description: string}> = [
  {value: 'quick', label: '快速问答', description: '只读查询已有资料、邮件与客户记录'},
  {value: 'standard', label: '标准工作', description: '处理邮件与客户任务，按需搜索公开资料'},
  {value: 'deep', label: '深入研究', description: '多步调查、公司分析与候选评估'},
];

/** Unknown values must not silently select a more capable mode. */
export function parseAgentMode(value: unknown): AgentMode {
  if (value === undefined) return DEFAULT_AGENT_MODE;
  if (typeof value === 'string' && AGENT_MODES.includes(value as AgentMode)) return value as AgentMode;
  throw new Error('Invalid agent mode');
}
