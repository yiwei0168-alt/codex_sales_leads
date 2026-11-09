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
it.each([
 ['2026-11-01T16:00:00Z',480,'2026-11-02'],
 ['2026-11-01T15:59:59Z',480,'2026-11-01'],
 ['2026-01-01T00:15:00Z',-60,'2025-12-31'],
 ['2024-02-29T23:00:00Z',345,'2024-03-01'],
 ['2026-11-04 09:00:00+00',0,'2026-11-04'],
])('groups %s with explicit offset %s without exposing Date',async(text,offset,localDate)=>{
 const bridge=vi.fn();
 expect(await interpretReadProgram(`return tools.time(${JSON.stringify(text)},${offset});`,bridge))
  .toEqual({epochMs:Date.parse(text),utcIso:new Date(text).toISOString(),offsetMinutes:offset,localDate});
 expect(bridge).not.toHaveBeenCalled();
});
it.each(['480',null,480.5,841,-841])('rejects an ambiguous or unsupported grouping offset %s',async offset=>{
 await expect(interpretReadProgram(`return tools.time('2026-11-04T09:00:00Z',${JSON.stringify(offset)});`,vi.fn())).rejects.toThrow('Program');
});
it('does not let guest built-in mutation weaken offset validation',async()=>{
 await expect(interpretReadProgram(`Number.isInteger=()=>true;return tools.time('2026-11-04T09:00:00Z','480');`,vi.fn())).rejects.toThrow('Program');
});
