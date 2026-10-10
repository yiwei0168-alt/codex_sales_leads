import content from './mode-prompt-content.json';

export const MODE_PROMPT_VERSION = 'agent-mode-prompts-v1.0.0';
export type AgentMode = 'quick' | 'standard' | 'deep';
export const DEFAULT_AGENT_MODE: AgentMode = 'standard';

/** Unknown persisted/client values must not silently become a more capable mode. */
export function parseAgentMode(value: unknown): AgentMode {
  if (value === undefined) return DEFAULT_AGENT_MODE;
  if (value === 'quick' || value === 'standard' || value === 'deep') return value;
  throw new Error('Invalid agent mode');
}

/** Static rules only. Tool authorization and context assembly remain server duties. */
export function modePromptRules(mode: AgentMode = DEFAULT_AGENT_MODE): string {
  const selected = parseAgentMode(mode);
  return `${content.common}\n\n${content[selected]}`;
}
