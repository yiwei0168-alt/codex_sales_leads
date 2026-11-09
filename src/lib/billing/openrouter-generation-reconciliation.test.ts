import {createHash} from 'node:crypto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),record:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:mocks.query}));
vi.mock('./reconciliation',()=>({recordVerifiedCostObservation:mocks.record}));
import {reconcileIncompleteOpenRouterGeneration} from './openrouter-generation-reconciliation';
const receipt={version:'incomplete-model-stream-v1',generationId:'gen-owned',reportedModel:'openai/gpt-6-luna',finishReason:null,doneMarker:false};
const row={provider_request_hash:createHash('sha256').update(receipt.generationId).digest('hex'),tariff_key:'openrouter-test',metrics:{incompleteStream:receipt,
 modelAttempt:{requestedModel:'openai/gpt-6-luna',gatewayHost:'openrouter.ai',endpointKind:'chat-completions'}}};
const data={id:'gen-owned',model:'openai/gpt-6-luna',total_cost:.0012341,is_byok:false,streamed:true,cancelled:false,finish_reason:'tool_calls',created_at:'2026-11-10T00:00:00Z'};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('OPENROUTER_API_KEY','fixture-private-key');vi.stubEnv('OPENROUTER_BASE_URL','https://openrouter.ai/api/v1');mocks.query.mockResolvedValue([row]);mocks.record.mockResolvedValue({duplicate:false,canSettle:true});});
afterEach(()=>vi.unstubAllEnvs());
it('performs one bounded metadata GET for an owned request and records a uniquely matchable provider report',async()=>{
 const transport=vi.fn<typeof fetch>().mockResolvedValue(Response.json({data}));
 const result=await reconcileIncompleteOpenRouterGeneration('owner','reservation',transport);
 expect(mocks.query).toHaveBeenCalledWith('owner',expect.stringContaining('where user_id=$1 and id=$2'),['owner','reservation']);
 expect(transport).toHaveBeenCalledOnce();
 const [url,init]=transport.mock.calls[0];
 expect(String(url)).toBe('https://openrouter.ai/api/v1/generation?id=gen-owned');
 expect(init).toMatchObject({method:'GET',redirect:'error'});expect(init?.body).toBeUndefined();
 expect(mocks.record).toHaveBeenCalledWith('owner','reservation',expect.objectContaining({amountMicros:1235,complete:true,providerRequestHash:row.provider_request_hash,kind:'provider-report'}));
 expect(result).toMatchObject({status:'observed',settled:true,providerCostUsd:.0012341});
 expect(JSON.stringify(result)).not.toContain('fixture-private-key');
});
it.each([[],[{...row,provider_request_hash:'wrong'}],[{...row,tariff_key:'other'}],[{...row,metrics:{}}]].map(rows=>({rows})))('does not send for a missing or unbound reservation',async({rows})=>{
 mocks.query.mockResolvedValue(rows);const transport=vi.fn();
 expect((await reconcileIncompleteOpenRouterGeneration('other-owner','reservation',transport)).status).toBe('unavailable');
 expect(transport).not.toHaveBeenCalled();expect(mocks.record).not.toHaveBeenCalled();
});
it.each([{id:'gen-other'},{model:'openai/other'},{is_byok:true},{cancelled:true},{finish_reason:null},{streamed:false},{total_cost:-1},{total_cost:null},{created_at:'invalid'}])('keeps uncertainty for invalid provider metadata %j',async change=>{
 const transport=vi.fn<typeof fetch>().mockResolvedValue(Response.json({data:{...data,...change}}));
 expect((await reconcileIncompleteOpenRouterGeneration('owner','reservation',transport)).status).toBe('unavailable');
 expect(transport).toHaveBeenCalledOnce();expect(mocks.record).not.toHaveBeenCalled();
});
it.each([404,429,500])('does not turn HTTP %s into zero spend or retry',async status=>{
 const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response(null,{status}));
 expect((await reconcileIncompleteOpenRouterGeneration('owner','reservation',transport)).status).toBe('unavailable');
 expect(transport).toHaveBeenCalledOnce();expect(mocks.record).not.toHaveBeenCalled();
});
it('bounds metadata size and never writes a report from oversized input',async()=>{
 const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(262145)));
 expect((await reconcileIncompleteOpenRouterGeneration('owner','reservation',transport)).status).toBe('unavailable');expect(mocks.record).not.toHaveBeenCalled();
});
it('retains failure on network errors and does not retry',async()=>{
 const transport=vi.fn<typeof fetch>().mockRejectedValue(new Error('private provider body'));
 const result=await reconcileIncompleteOpenRouterGeneration('owner','reservation',transport);
 expect(result).toEqual({status:'unavailable',reason:'metadata-transport-error'});expect(transport).toHaveBeenCalledOnce();expect(mocks.record).not.toHaveBeenCalled();
});
it('does not hide persistence failure or reissue metadata requests',async()=>{
 mocks.record.mockRejectedValue(new Error('storage'));const transport=vi.fn<typeof fetch>().mockResolvedValue(Response.json({data}));
 await expect(reconcileIncompleteOpenRouterGeneration('owner','reservation',transport)).rejects.toThrow('storage');expect(transport).toHaveBeenCalledOnce();
});
it('matches the exact observation-mode tariff to the stored endpoint and model',async()=>{
 const routeHash=createHash('sha256').update('https://openrouter.ai\n/api/v1/chat/completions\nopenai/gpt-6-luna').digest('hex').slice(0,16);
 mocks.query.mockResolvedValue([{...row,tariff_key:`a33-unbounded-${routeHash}`}]);
 expect((await reconcileIncompleteOpenRouterGeneration('owner','reservation',vi.fn<typeof fetch>().mockResolvedValue(Response.json({data})))).status).toBe('observed');
 mocks.record.mockClear();mocks.query.mockResolvedValue([{...row,tariff_key:'a33-unbounded-0000000000000000'}]);
 const transport=vi.fn();expect((await reconcileIncompleteOpenRouterGeneration('owner','reservation',transport)).status).toBe('unavailable');expect(transport).not.toHaveBeenCalled();
});
