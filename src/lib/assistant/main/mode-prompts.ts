import content from './mode-prompt-content.json';
import { KNOWLEDGE_RESPONSE_POLICY } from './knowledge-response-policy';

export const LEGACY_MODE_PROMPT_VERSION = 'agent-mode-prompts-v1.0.0';
export const MODE_PROMPT_VERSION = 'agent-mode-prompts-v1.1.0';
export type AgentMode = 'quick' | 'standard' | 'deep';
export const DEFAULT_AGENT_MODE: AgentMode = 'standard';

/** Unknown persisted/client values must not silently become a more capable mode. */
export function parseAgentMode(value: unknown): AgentMode {
  if (value === undefined) return DEFAULT_AGENT_MODE;
  if (value === 'quick' || value === 'standard' || value === 'deep') return value;
  throw new Error('Invalid agent mode');
}

/** Static rules only. Tool authorization and context assembly remain server duties. */
export function modePromptRules(mode: AgentMode = DEFAULT_AGENT_MODE,
  version: string = MODE_PROMPT_VERSION): string {
  const selected = parseAgentMode(mode);
  if(version!==MODE_PROMPT_VERSION&&version!==LEGACY_MODE_PROMPT_VERSION)throw new Error('Unknown mode prompt version');
  return `${content.common}\n\n${content[selected]}${version===MODE_PROMPT_VERSION?`\n\n${KNOWLEDGE_RESPONSE_POLICY}`:''}`;
}
