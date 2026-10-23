import { describe, expect, it } from 'vitest';
import { modePromptRules, parseAgentMode, MODE_PROMPT_VERSION, KNOWLEDGE_MODE_PROMPT_VERSION, LEGACY_MODE_PROMPT_VERSION } from './mode-prompts';
import content from './mode-prompt-content.json';
import { KNOWLEDGE_RESPONSE_POLICY } from './knowledge-response-policy';
import { modeConfigSchema, modeModelConfig } from './mode-config';

describe('mode prompt selection boundary', () => {
  it.each(['quick','standard','deep'] as const)('preserves historical %s prompts while new tasks get readability guidance', mode => {
    expect(modePromptRules(mode,LEGACY_MODE_PROMPT_VERSION)).toBe(`${content.common}\n\n${content[mode]}`);
    expect(modePromptRules(mode,KNOWLEDGE_MODE_PROMPT_VERSION)).toBe(`${content.common}\n\n${content[mode]}\n\n${KNOWLEDGE_RESPONSE_POLICY}`);
    const profile=modeModelConfig(mode).profile!;
    expect(profile.promptVersion).toBe(MODE_PROMPT_VERSION);
    expect(modePromptRules(mode,profile.promptVersion)).toContain('回答组织与可读性');
    expect(modeConfigSchema.parse({...profile,promptVersion:KNOWLEDGE_MODE_PROMPT_VERSION}).promptVersion).toBe(KNOWLEDGE_MODE_PROMPT_VERSION);
  });
  it('defaults only an omitted selection to standard', () => {
    expect(parseAgentMode(undefined)).toBe('standard');
    expect(modePromptRules()).toBe(modePromptRules('standard'));
  });
  it.each([null, '', 'research', 'DEEP', {}, ['deep'], '__proto__', 'constructor'])(
    'rejects invalid or prototype-derived mode %j instead of upgrading', value => {
      expect(() => parseAgentMode(value)).toThrow('Invalid agent mode');
    },
  );
  it('keeps the read-only constraint isolated from standard and deep instructions', () => {
    const quick = modePromptRules('quick');
    expect(quick).toContain('不发起邮件同步、公开网页搜索');
    expect(quick).not.toContain('可按需使用少量公开网页搜索补充单个事实');
    expect(quick).not.toContain('正式评分必须使用现有评分政策');
    for (const mode of ['quick', 'standard', 'deep'] as const) {
      const prompt = modePromptRules(mode);
      expect(prompt).toContain('同一范围已经批准不重复请求');
      expect(prompt).toContain('不向公开搜索、任意网站或其他服务泄露私有内容');
      expect(prompt).toContain('不重复已执行动作');
    }
  });
});
