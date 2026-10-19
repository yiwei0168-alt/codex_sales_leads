import {expect,it,vi} from 'vitest';
import {completeDisposableCheck} from '../../../../scripts/lib/ma24-disposable-cleanup';
it('retains the original failure and attempts every ordered cleanup even after Docker failures',async()=>{
 const primary=new Error('original acceptance failure'),order:string[]=[];
 const steps=['restored-container','web-container','database-container','network'].map(name=>({name,run:async()=>{order.push(name);if(name!=='network')throw new Error('Docker 500');}}));
 const error=await completeDisposableCheck({error:primary},steps).catch(error=>error);
 expect(order).toEqual(steps.map(row=>row.name));expect(error).toBeInstanceOf(AggregateError);expect(error.errors[0]).toBe(primary);
 expect(error.errors.slice(1).map((row:Error)=>row.message)).toEqual(steps.slice(0,3).map(row=>`Disposable cleanup failed: ${row.name}`));
});
it('rethrows the exact primary failure after successful cleanup',async()=>{
 const error=new Error('original'),run=vi.fn().mockResolvedValue(undefined);
 await expect(completeDisposableCheck({error},[{name:'database',run}])).rejects.toBe(error);expect(run).toHaveBeenCalledOnce();
});
it('does not report success if cleanup alone failed',async()=>{
 const failure=new Error('Docker 500');const out=await completeDisposableCheck(undefined,[{name:'database',run:async()=>{throw failure;}}]).catch(error=>error);
 expect(out).toBeInstanceOf(AggregateError);expect(out.errors[0].cause).toBe(failure);
});
it('returns only when all cleanup steps have finished',async()=>{
 const order:string[]=[];await completeDisposableCheck(undefined,[{name:'database',run:async()=>{await Promise.resolve();order.push('database');}},{name:'network',run:async()=>{order.push('network');}}]);
 expect(order).toEqual(['database','network']);
});
