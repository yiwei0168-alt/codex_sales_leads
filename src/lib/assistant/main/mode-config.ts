import { z } from 'zod';
import { parseAgentMode, MODE_PROMPT_VERSION, LEGACY_MODE_PROMPT_VERSION, type AgentMode } from './mode-prompts';
import type { ModelConfig } from './contracts';

export const modeConfigSchema = z.object({
  mode: z.enum(['quick','standard','deep']), version: z.literal('agent-modes-v1'),
  promptVersion: z.enum([MODE_PROMPT_VERSION,LEGACY_MODE_PROMPT_VERSION]),
  firstOutputMs: z.number().int().min(1000).max(300000), totalMs: z.number().int().min(1000).max(900000),
  routes: z.array(z.object({model:z.string().min(1),effort:z.enum(['none','low','medium','high'])}).strict()).length(3),
}).strict().refine(v=>v.firstOutputMs<=v.totalMs&&new Set(v.routes.map(r=>r.model)).size===3);
export type ModeConfig = z.infer<typeof modeConfigSchema>;
const routes = {
  quick: ['openai/gpt-6-luna','anthropic/claude-haiku-5.5','google/gemini-3.8-flash'],
  standard: ['anthropic/claude-sonnet-5.5','openai/gpt-6.1-sol','moonshotai/kimi-k3'],
  deep: ['openai/gpt-6.1-sol','anthropic/claude-opus-5.5','z-ai/glm-5.3'],
} as const;
export const modeModelIds: ReadonlySet<string> = new Set(Object.values(routes).flat());
export function modeModelConfig(selection: unknown): ModelConfig {
  const mode = parseAgentMode(selection);
  const times:Record<AgentMode,[number,number]>={quick:[15000,60000],standard:[30000,120000],deep:[60000,300000]};
  const configured = process.env.AGENT_MODE_TIMEOUTS_JSON ? JSON.parse(process.env.AGENT_MODE_TIMEOUTS_JSON) : {};
  const [firstOutputMs,totalMs] = configured[mode] ?? times[mode];
  const profile=modeConfigSchema.parse({mode,version:'agent-modes-v1',promptVersion:MODE_PROMPT_VERSION,firstOutputMs,totalMs,
    routes:routes[mode].map(model=>({model,effort:mode==='deep'?'high':model==='openai/gpt-6-luna'?'none':'low'}))});
  return {model:profile.routes[0].model,providers:[],version:profile.version,profile};
}
