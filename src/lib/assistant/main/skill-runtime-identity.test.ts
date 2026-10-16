import {expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({packed:false,link:false,reads:[] as string[]}));
vi.mock('node:fs/promises',()=>({
 lstat:vi.fn(async(path:string)=>{if(path==='.skill-runtime-source'&&!state.packed)throw Object.assign(new Error('missing'),{code:'ENOENT'});return {isDirectory:()=>true,isSymbolicLink:()=>state.link};}),
 readdir:vi.fn(async()=>[{name:'sample.ts',isSymbolicLink:()=>false,isDirectory:()=>false}]),
 readFile:vi.fn(async(path:string)=>{state.reads.push(path);return path.replaceAll('\\','/').replace(/^\.skill-runtime-source\//,'').replace(/^\.\//,'');}),
}));
vi.mock('./model',()=>({modelFunctions:[]}));
vi.mock('./recorded-task-source',()=>({loadRecordedTaskChain:vi.fn()}));
vi.mock('./local-analysis-boundary',()=>({assertLocalAnalysisBoundary:vi.fn()}));
import {skillSourceRuntimeHash} from './skill-runtime-identity';

it('packaged source preserves logical fingerprint and reads only the packaged inputs',async()=>{
 state.packed=false;const source=await skillSourceRuntimeHash();state.reads=[];state.packed=true;
 expect(await skillSourceRuntimeHash()).toBe(source);
 expect(state.reads).toHaveLength(5);
 expect(state.reads.every(path=>path.startsWith('.skill-runtime-source'))).toBe(true);
 state.link=true;await expect(skillSourceRuntimeHash()).rejects.toThrow('must be a directory');state.link=false;
});
