/** Internal model tiers and compatibility with persisted manual-mode tasks. */
export const AGENT_MODES = ['quick', 'standard', 'deep'] as const;
export type AgentMode = typeof AGENT_MODES[number];
export const DEFAULT_AGENT_MODE: AgentMode = 'standard';

/** Unknown values must not silently select a more capable mode. */
export function parseAgentMode(value: unknown): AgentMode {
  if (value === undefined) return DEFAULT_AGENT_MODE;
  if (typeof value === 'string' && AGENT_MODES.includes(value as AgentMode)) return value as AgentMode;
  throw new Error('Invalid agent mode');
}
