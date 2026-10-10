import { describe, expect, it } from 'vitest';
import { modePromptRules, parseAgentMode } from './mode-prompts';

describe('mode prompt selection boundary', () => {
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
