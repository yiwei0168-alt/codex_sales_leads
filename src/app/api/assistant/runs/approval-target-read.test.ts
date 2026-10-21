import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),runs:vi.fn(),run:vi.fn(),approvals:vi.fn(),targets:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({requireApiSession:m.session}));
vi.mock('@/lib/assistant/main/repository',()=>({listRuns:m.runs,getRun:m.run}));
vi.mock('@/lib/assistant/main/approvals',()=>({listApprovals:m.approvals}));
vi.mock('@/lib/assistant/main/approval-targets',()=>({withApprovalTargets:m.targets}));
import {GET as runsGET} from './route';
import {GET as approvalsGET} from './[id]/approvals/route';
const owner='11111111-1111-4111-8111-111111111111',run='22222222-2222-4222-8222-222222222222';
const approval={id:'approval',tool_id:'knowledge_private_delete',payload:{documentId:run,expectedHash:'a'.repeat(64)}};
const target={kind:'private-knowledge',state:'current',title:'Owned notes'};
const readRuns=()=>runsGET(new Request(`http://localhost/api/assistant/runs?conversationId=${run}`));
const readApprovals=()=>approvalsGET(new Request('http://localhost/'),{params:Promise.resolve({id:run})});
beforeEach(()=>{vi.resetAllMocks();m.session.mockResolvedValue({userId:owner});m.runs.mockResolvedValue([{id:run,approvals:[approval]}]);m.run.mockResolvedValue({id:run});m.approvals.mockResolvedValue([approval]);m.targets.mockResolvedValue([{...approval,target}]);});
it('enriches both read paths from the session actor with private no-store responses',async()=>{
 for(const response of [await readRuns(),await readApprovals()]){expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('private, no-store');expect(await response.text()).toContain('Owned notes');}
 expect(m.targets).toHaveBeenCalledTimes(2);for(const call of m.targets.mock.calls)expect(call).toEqual([owner,[approval]]);
});
it('does not look up names for unauthenticated callers or a foreign run',async()=>{
 m.session.mockResolvedValue(new Response('',{status:401}));expect((await readRuns()).status).toBe(401);expect((await readApprovals()).status).toBe(401);expect(m.targets).not.toHaveBeenCalled();
 m.session.mockResolvedValue({userId:owner});m.run.mockResolvedValue(null);expect((await readApprovals()).status).toBe(404);expect(m.targets).not.toHaveBeenCalled();
});
it('does not return old or private names if target lookup fails',async()=>{
 m.targets.mockRejectedValue(new Error('PRIVATE title and database details'));
 for(const response of [await readRuns(),await readApprovals()]){expect(response.status).toBe(503);expect(await response.text()).not.toContain('PRIVATE');}
});
