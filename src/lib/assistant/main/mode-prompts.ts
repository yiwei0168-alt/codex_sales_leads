import content from './mode-prompt-content.json';
import { KNOWLEDGE_RESPONSE_POLICY } from './knowledge-response-policy';
import { RESPONSE_READABILITY_POLICY, RESPONSE_RESPONSIBILITY_POLICY } from './response-readability-policy';
import { DEFAULT_AGENT_MODE, parseAgentMode, type AgentMode } from './mode-contract';
export { DEFAULT_AGENT_MODE, parseAgentMode, type AgentMode } from './mode-contract';

export const LEGACY_MODE_PROMPT_VERSION = 'agent-mode-prompts-v1.0.0';
export const KNOWLEDGE_MODE_PROMPT_VERSION = 'agent-mode-prompts-v1.1.0';
export const READABILITY_MODE_PROMPT_VERSION = 'agent-mode-prompts-v1.2.0';
export const MODE_PROMPT_VERSION = 'agent-mode-prompts-v1.3.0';
/** Static rules only. Tool authorization and context assembly remain server duties. */
export function modePromptRules(mode: AgentMode = DEFAULT_AGENT_MODE,
  version: string = MODE_PROMPT_VERSION): string {
  const selected = parseAgentMode(mode);
  if(version!==MODE_PROMPT_VERSION&&version!==READABILITY_MODE_PROMPT_VERSION&&version!==KNOWLEDGE_MODE_PROMPT_VERSION&&version!==LEGACY_MODE_PROMPT_VERSION)throw new Error('Unknown mode prompt version');
  const presentation=version===MODE_PROMPT_VERSION?RESPONSE_RESPONSIBILITY_POLICY:version===READABILITY_MODE_PROMPT_VERSION?RESPONSE_READABILITY_POLICY:'';
  return `${content.common}\n\n${content[selected]}${version!==LEGACY_MODE_PROMPT_VERSION?`\n\n${KNOWLEDGE_RESPONSE_POLICY}`:''}${presentation?`\n\n${presentation}`:''}`;
}
