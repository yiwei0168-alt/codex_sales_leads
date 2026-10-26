import {afterEach,expect,it,vi} from 'vitest';
import {commandHasPath,ownsProcess,selectExisting,ensureComponent,sha,filterRuntimeEnvironment} from '../../../scripts/lib/local-runtime.mjs';
const entry='F:\\workspace\\api.mjs',root='F:\\workspace\\release';
const component={name:'api',identityPaths:[entry,root],port:2024,health:'http://127.0.0.1:2024/ok',startupMs:3000};
const process={pid:11,createdAt:'2026-10-26',commandLine:`node "${entry}" "${root}"`};
const empty={processes:[],listeners:[]},running={processes:[process],listeners:[{port:2024,address:'127.0.0.1',pid:11}]};
afterEach(()=>vi.useRealTimers());
it('keeps application configuration while removing migration, override and trace credentials',()=>{
 const denied=['DATABASE_MIGRATION_URL','PAID_CALL_STAGE_OVERRIDE','PAID_CALL_STAGE_OVERRIDE_USER_ID','NODE_OPTIONS','LANGSMITH_API_KEY','LANGCHAIN_API_KEY'];
 const source=['DATABASE_URL',...denied].map(key=>key+'=synthetic').join('\n');
 const env=filterRuntimeEnvironment(source,{...Object.fromEntries(denied.map(key=>[key,'synthetic'])),DATABASE_URL:'synthetic-app',AMBIENT_SECRET:'not-configured'});
 expect(env.DATABASE_URL).toBe('synthetic-app');for(const key of [...denied,'AMBIENT_SECRET'])expect(env).not.toHaveProperty(key);expect(env.LANGSMITH_TRACING).toBe('false');expect(env.NO_PROXY).toContain('127.0.0.1');
});
it('matches complete path arguments, not similarly prefixed releases',()=>{
 expect(commandHasPath(`node "${entry}" "${root}-other"`,root)).toBe(false);
 expect(ownsProcess(component,process)).toBe(true);
});
it('does not trust a reused legacy PID or changed command',()=>{
 const legacy={...component,identityPaths:['missing'],legacy:[{pid:11,createdAt:process.createdAt,commandSha256:sha(process.commandLine)}]};
 expect(ownsProcess(legacy,process)).toBe(true);expect(ownsProcess(legacy,{...process,createdAt:'later'})).toBe(false);expect(ownsProcess(legacy,{...process,commandLine:'different'})).toBe(false);
});
it('adopts a healthy service without spawning or replacing it',async()=>{
 const start=vi.fn();expect(await ensureComponent(component,{inventory:async()=>running,healthy:async()=>true,start,wait:vi.fn()})).toEqual({name:'api',pid:11,adopted:true});expect(start).not.toHaveBeenCalled();
});
it('adopts the actual listener when a Windows Python launcher shares its script path',()=>{
 const child={...process,pid:12,createdAt:'later'};
 expect(selectExisting(component,{processes:[process,child],listeners:[{port:2024,address:'127.0.0.1',pid:12}]})).toEqual(child);
 expect(selectExisting(component,{processes:[process,child],listeners:[]})).toEqual(process);
});
it('refuses an unrelated or exposed listener instead of killing or duplicating it',()=>{
 expect(()=>selectExisting(component,{processes:[],listeners:[{port:2024,address:'127.0.0.1',pid:91}]})).toThrow('unrecognized');
 expect(()=>selectExisting(component,{processes:[process],listeners:[{port:2024,address:'0.0.0.0',pid:11}]})).toThrow('non-loopback');
});
it('starts once then waits for readiness without duplicating a cold service',async()=>{
 const inventory=vi.fn().mockResolvedValueOnce(empty).mockResolvedValue(running),healthy=vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true),start=vi.fn();
 expect(await ensureComponent(component,{inventory,healthy,start,wait:async()=>{}})).toEqual({name:'api',pid:11,adopted:false});expect(start).toHaveBeenCalledTimes(1);expect(healthy).toHaveBeenCalledTimes(2);
});
it('keeps an existing cold process and reports timeout without destructive repair',async()=>{
 vi.useFakeTimers();vi.setSystemTime(0);const start=vi.fn();
 await expect(ensureComponent(component,{inventory:async()=>running,healthy:async()=>false,start,wait:async(ms:number)=>vi.setSystemTime(Date.now()+ms)})).rejects.toThrow('deadline');expect(start).not.toHaveBeenCalled();
});
