import {afterEach,beforeEach,expect,it,vi} from 'vitest';

const m=vi.hoisted(()=>({query:vi.fn(),project:vi.fn(),end:vi.fn(),sleep:vi.fn(),stop:undefined as undefined|(()=>void)}));
vi.mock('@next/env',()=>({default:{loadEnvConfig:vi.fn()}}));
vi.mock('../rag/db',()=>({query:m.query,getPool:()=>({end:m.end})}));
vi.mock('./memory-graph-outbox',()=>({processMemoryGraphOutbox:m.project}));
vi.mock('node:timers/promises',()=>({setTimeout:m.sleep}));

beforeEach(()=>{
  vi.resetModules();vi.clearAllMocks();vi.stubEnv('ENABLE_MEMORY_GRAPH_PROJECTION','1');
  m.stop=undefined;m.end.mockResolvedValue(undefined);m.sleep.mockResolvedValue(undefined);
  const once=process.once.bind(process);
  vi.spyOn(process,'once').mockImplementation(((event:string,listener:()=>void)=>{
    if(event==='SIGINT'||event==='SIGTERM'){m.stop=listener;return process;}
    return once(event,listener);
  }) as typeof process.once);
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});

it('survives a failed queue read, backs off without leaking the exception, and processes the next job',async()=>{
  const error=vi.spyOn(console,'error').mockImplementation(()=>undefined);
  vi.spyOn(console,'info').mockImplementation(()=>undefined);
  m.query.mockRejectedValueOnce(new Error('Sensitive source and connection details must not be logged'))
    .mockResolvedValueOnce([{owner_id:'synthetic-owner',observation_id:'synthetic-observation'}]);
  m.project.mockImplementation(async()=>{m.stop?.();return 'delivered';});
  await import('../../../scripts/run-memory-graph-worker');
  expect(m.query).toHaveBeenCalledTimes(2);
  expect(m.sleep).toHaveBeenCalledExactlyOnceWith(30000);
  expect(m.project).toHaveBeenCalledExactlyOnceWith('synthetic-owner','synthetic-observation');
  expect(error).toHaveBeenCalledExactlyOnceWith(JSON.stringify({event:'memory-graph-worker-retry',reason:'local_dependency_unavailable'}));
  expect(m.end).toHaveBeenCalledOnce();
});
