import { expect, it } from 'vitest';
import { tariffSchema } from '../../billing/policy';
import { MODE_MODEL_MAX_OUTPUT_TOKENS } from '../../assistant/main/model';
import type { Ma24G15Preview } from './ma24-g15-runtime-binding';
import { assertMa24G15TariffCoverage } from './ma24-g15-tariff-coverage';

const now = Date.parse('2026-10-16T00:00:00Z');
const models = ['anthropic/claude-sonnet-5.5', 'openai/gpt-6.1-sol',
  'moonshotai/kimi-k3'];
const preview = () => ({
  modelProfile: { mode: 'standard', version: 'agent-modes-v1',
    promptVersion: 'agent-mode-prompts-v1.1.0', firstOutputMs: 30_000,
    totalMs: 120_000, routes: models.map(model => ({ model, effort: 'low' })) },
  maximumRequestBytes: 100_000,
  maximumOutputTokens: MODE_MODEL_MAX_OUTPUT_TOKENS,
} as Ma24G15Preview);
const rule = (model: string, expiresAt = '2026-10-17T00:00:00Z') => tariffSchema.parse({
  key: `reviewed-${model}`, origin: 'https://openrouter.ai',
  pathname: '/api/v1/chat/completions', model,
  maximumChargeMicros: 1_000_000, maximumRequestBytes: 100_000,
  maximumOutputTokens: MODE_MODEL_MAX_OUTPUT_TOKENS,
  boundDescription: 'Synthetic complete request bound for a mode route coverage check.',
  reference: 'https://example.invalid/reviewed-tariff',
  verifiedAt: '2026-10-15T00:00:00Z', expiresAt,
});

it('requires a live billing rule for every fallback route', () => {
  const rules = models.map(model => rule(model));
  expect(assertMa24G15TariffCoverage(preview(), now, rules))
    .toEqual(models.map(model => `reviewed-${model}`));
  expect(() => assertMa24G15TariffCoverage(preview(), now, rules.slice(0, 2)))
    .toThrow('missing-tariff');
});

it('rejects expired rates and rates below the frozen request bounds', () => {
  const rules = models.map(model => rule(model));
  expect(() => assertMa24G15TariffCoverage(preview(), now,
    [...rules.slice(0, 2), rule(models[2], '2026-10-15T23:59:59Z')]))
    .toThrow('expired-tariff');
  const smaller = preview();
  smaller.maximumRequestBytes = 100_001;
  expect(() => assertMa24G15TariffCoverage(smaller, now, rules))
    .toThrow('request-out-of-bounds');
  smaller.maximumRequestBytes = 100_000;
  smaller.maximumOutputTokens = MODE_MODEL_MAX_OUTPUT_TOKENS - 1;
  expect(() => assertMa24G15TariffCoverage(smaller, now, rules))
    .toThrow('MA24 G15 model tariff request bounds unavailable');
});

it('refuses to treat another workflow request contract as a mode tariff', () => {
  const rules = models.map(model => rule(model));
  rules[0] = tariffSchema.parse({ ...rules[0],
    requestContract: 'openrouter-sol-openai-playbook-v2' });
  expect(() => assertMa24G15TariffCoverage(preview(), now, rules))
    .toThrow('MA24 G15 model tariff contract differs from mode stream');
});
