import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),list:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({requireApiSession:mocks.session}));
vi.mock('@/lib/sales/manual-company',()=>({addManualCompany:vi.fn(),manualCompanySchema:{safeParse:vi.fn()}}));
vi.mock('@/lib/sales/company-list',async importOriginal=>({...await importOriginal<object>(),listOwnedSalesCompanies:mocks.list}));
import {GET} from './route';
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({userId:'account-owner'});mocks.list.mockResolvedValue({items:[],hasMore:false});});
it('requires a login before any company read',async()=>{
 mocks.session.mockResolvedValue(new Response(null,{status:401}));
 expect((await GET(new Request('https://app.test/api/workspaces/current/companies'))).status).toBe(401);
 expect(mocks.list).not.toHaveBeenCalled();
});
it('binds page and country to the authenticated owner and disables caching',async()=>{
 const r=await GET(new Request('https://app.test/api/workspaces/current/companies?offset=20&countryCode=GB'));
 expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');
 expect(mocks.list).toHaveBeenCalledWith('account-owner',{offset:20,countryCode:'GB'});
});
it.each(['userId=other','offset=-1','offset=1&offset=2','countryCode=GB&countryCode=DE','offset=bad','offset=100001'])('rejects unsafe or ambiguous query %s before a read',async query=>{
 expect((await GET(new Request(`https://app.test/api/workspaces/current/companies?${query}`))).status).toBe(400);
 expect(mocks.list).not.toHaveBeenCalled();
});
