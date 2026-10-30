import{afterEach,expect,it,vi}from'vitest';import type{PoolClient}from'pg';
import{assertSavedRecoveryRequestsSafe,isReadOnlyUnknownRecoveryRequest,type RecoveryRequestState}from'./recovery-request-safety';
const text:RecoveryRequestState={status:'unknown',stage:'scoring',task:'lead-qualification',endpoint:'chat-completions',http_status:null,valid_outputs:'0'};
afterEach(()=>vi.unstubAllEnvs());
it('permits known read-only unknown bills under MA05 without changing any receipt',async()=>{
 vi.stubEnv('PRODUCT_FINANCIAL_POLICY','observe');const query=vi.fn(async()=>({rows:[text,{...text,task:null,endpoint:null,stage:'collecting-evidence',http_status:'200',valid_outputs:'1'}]}));
 await expect(assertSavedRecoveryRequestsSafe({query}as unknown as PoolClient,'owner','parent')).resolves.toBeUndefined();
 expect(query).toHaveBeenCalledOnce();expect(query.mock.calls[0]).toBeDefined();
 expect(isReadOnlyUnknownRecoveryRequest({...text,task:'mail-send'})).toBe(false);
});
it.each(['reserved','bound-exceeded','unsafe-task','unknown-search-outcome','unknown-endpoint'])('still blocks %s in observation mode',async kind=>{
 vi.stubEnv('PRODUCT_FINANCIAL_POLICY','observe');let row={...text};
 if(kind==='reserved'||kind==='bound-exceeded')row.status=kind;
 if(kind==='unsafe-task')row.task='mail-send';
 if(kind==='unknown-search-outcome')row={...row,task:null,endpoint:null,stage:'collecting-evidence'};
 if(kind==='unknown-endpoint')row.endpoint='other';
 const query=vi.fn(async()=>({rows:[row]}));await expect(assertSavedRecoveryRequestsSafe({query}as unknown as PoolClient,'owner','parent')).rejects.toThrow('paid-request-already-recorded');
});
it('retains strict admission without changing deployment policy',async()=>{
 vi.stubEnv('PRODUCT_FINANCIAL_POLICY','strict');const query=vi.fn(async()=>({rows:[text]}));
 await expect(assertSavedRecoveryRequestsSafe({query}as unknown as PoolClient,'owner','parent')).rejects.toThrow('paid-request-already-recorded');
 expect(process.env.PRODUCT_FINANCIAL_POLICY).toBe('strict');
});
