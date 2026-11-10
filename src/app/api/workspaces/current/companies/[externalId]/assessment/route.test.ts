import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),read:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({requireApiSession:m.session}));
vi.mock('@/lib/sales/company-detail-read',()=>({readSavedCompanyAssessment:m.read}));
import {GET} from './route';
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({userId:'owner'});m.read.mockResolvedValue(null);});
it('keeps assessment citations authenticated and bound to the session owner',async()=>{
 const r=await GET(new Request('https://app.test/'),{params:Promise.resolve({externalId:'candidate'})});
 expect(m.read).toHaveBeenCalledWith('owner','candidate');
 expect(r.headers.get('cache-control')).toBe('private, no-store');
 expect(await r.json()).toEqual({assessment:null});
});
it('does not access assessments before login',async()=>{
 m.session.mockResolvedValue(new Response(null,{status:401}));
 expect((await GET(new Request('https://app.test/'),{params:Promise.resolve({externalId:'candidate'})})).status).toBe(401);
 expect(m.read).not.toHaveBeenCalled();
});
