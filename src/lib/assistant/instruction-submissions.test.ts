import {afterEach,beforeEach,expect,it,vi} from 'vitest';
let entries:Map<string,string>;
beforeEach(()=>{vi.resetModules();entries=new Map();vi.stubGlobal('window',{sessionStorage:{get length(){return entries.size;},key:(i:number)=>[...entries.keys()][i]??null,getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>entries.set(key,value),removeItem:(key:string)=>entries.delete(key)}});});
afterEach(()=>vi.unstubAllGlobals());
it('recovers identity after module reload without storing instruction text',async()=>{
 let helper=await import('./instruction-submissions');const first=await helper.prepareInstructionSubmission('run',' Sensitive generated instruction ');expect(entries.size).toBe(1);expect(JSON.stringify([...entries])).not.toContain('Sensitive generated');vi.resetModules();helper=await import('./instruction-submissions');expect(helper.pendingInstructionSubmissions('run').map(item=>item.requestKey)).toEqual([first.requestKey]);expect((await helper.prepareInstructionSubmission('run','Sensitive generated instruction')).requestKey).toBe(first.requestKey);
});
it('preserves unknown identities for different contents and scopes',async()=>{
 const h=await import('./instruction-submissions');const first=await h.prepareInstructionSubmission('one','same');const second=await h.prepareInstructionSubmission('one','other');const other=await h.prepareInstructionSubmission('two','same');expect(new Set([first.requestKey,second.requestKey,other.requestKey]).size).toBe(3);expect((await h.prepareInstructionSubmission('one','same')).requestKey).toBe(first.requestKey);expect(h.pendingInstructionSubmissions('one')).toHaveLength(2);
});
it('only a known acknowledgement permits a new identical submission',async()=>{
 const h=await import('./instruction-submissions');const first=await h.prepareInstructionSubmission('run','same');first.acknowledge();expect(h.pendingInstructionSubmissions('run')).toHaveLength(0);expect((await h.prepareInstructionSubmission('run','same')).requestKey).not.toBe(first.requestKey);
});
it('does not remove a newer ticket and tolerates unavailable storage',async()=>{
 const h=await import('./instruction-submissions'),first=await h.prepareInstructionSubmission('run','text');const storageKey=[...entries.keys()][0];entries.set(storageKey,'22222222-2222-4222-8222-222222222222');first.acknowledge();expect(entries.has(storageKey)).toBe(true);
 vi.stubGlobal('window',Object.defineProperty({},'sessionStorage',{get(){throw Error('Denied');}}));const later=await h.prepareInstructionSubmission('other','private text');expect((await h.prepareInstructionSubmission('other','private text')).requestKey).toBe(later.requestKey);later.acknowledge();
});
