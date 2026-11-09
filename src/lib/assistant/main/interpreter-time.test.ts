import { expect, it, vi } from 'vitest';
import { interpretReadProgram } from './hybrid-interpreter';

it.each([
  ['2026-11-04 09:00:00+00', '2026-11-04T09:00:00.000Z'],
  ['2026-11-04T01:00:00+08:00', '2026-11-03T17:00:00.000Z'],
  ['2024-02-29T23:30:00.12-0130', '2024-03-01T01:00:00.120Z'],
  ['2026-11-04T09:00:00Z', '2026-11-04T09:00:00.000Z'],
])('normalizes supplied explicit timezone %s without exposing a clock', async (text, utcIso) => {
  expect(await interpretReadProgram(`return tools.time(${JSON.stringify(text)});`, vi.fn()))
    .toEqual({epochMs:Date.parse(utcIso),utcIso});
});
it.each([undefined,0,'2026-11-04','2026-11-04T09:00:00','2025-02-29T09:00:00Z','2024-02-30T09:00:00Z',
  '2026-11-04T24:00:00Z','2026-11-04T09:00:60Z','2026-11-04T09:00:00+14:01','now'])('rejects ambiguous/invalid time %s', async text => {
  await expect(interpretReadProgram(`return tools.time(${JSON.stringify(text)});`,vi.fn())).rejects.toThrow('Program');
});
it('keeps native Date, host bridges and random unavailable even through helper results', async () => {
  expect(await interpretReadProgram(`const t=tools.time('2026-11-04T09:00:00Z');return [typeof Date, typeof NativeDate, typeof _receipt, t.constructor.name, tools.time.constructor('return typeof Date')()];`,vi.fn()))
    .toEqual(['undefined','undefined','undefined','Object','undefined']);
  await expect(interpretReadProgram('return Math.random();',vi.fn())).rejects.toThrow('Program');
});
