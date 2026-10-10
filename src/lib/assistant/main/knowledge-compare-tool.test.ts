import {beforeEach,expect,it,vi} from 'vitest';
import type {RetrievedChunk} from '@/lib/rag/types';
const mocks=vi.hoisted(()=>({search:vi.fn(),facts:vi.fn(),authorize:vi.fn()}));
vi.mock('@/lib/rag/repository',()=>({hybridSearch:mocks.search,authorizedKnowledgeChunkIds:mocks.authorize}));
vi.mock('@/lib/knowledge/fact-repository',()=>({resolveVerifiedFacts:mocks.facts}));
import {knowledgeCompareTool as tool} from './knowledge-compare-tool';
const context={userId:'owner',runId:'run',leaseToken:'lease',role:'member' as const};
const input={entities:['Fixture Alpha','Fixture Beta'],attributes:['ethernet_port_count','dc_input']};
const chunk=(id:string):RetrievedChunk=>({id,documentId:id,collection:'product',title:id,content:`${'navigation '.repeat(50)}tail value`,sourceType:'public-product-datasheet',
  authorityLevel:3,headingPath:[],retrievalSignals:['keyword'],corroborated:false,score:1,metadata:{},visibility:'shared'});
beforeEach(()=>{vi.resetAllMocks();mocks.facts.mockResolvedValue([]);mocks.authorize.mockImplementation(async(_u,ids)=>new Set(ids));
  mocks.search.mockImplementation(async(_u,_q,_v,filters)=>[chunk(filters.structuredProductTerms[0])]);});
it('reads each requested entity independently with fixed account and product scope',async()=>{
  const response=await tool.execute(input,context);
  const packet=response.data as {entities:Array<{entity:string;evidence:RetrievedChunk[];missingFields:string[]}>};
  expect(mocks.search).toHaveBeenCalledTimes(4);
  expect(mocks.search.mock.calls.map(call=>call[3].structuredProductTerms)).toEqual([['Fixture Alpha'],['Fixture Alpha'],['Fixture Beta'],['Fixture Beta']]);
  expect(mocks.search.mock.calls.every(call=>call[0]==='owner'&&call[2]===null&&call[3].collections[0]==='product')).toBe(true);
  expect(packet.entities.map(e=>e.evidence[0].id)).toEqual(input.entities);
  expect(packet.entities[0].evidence[0].content).toContain('tail value');
  expect(packet.entities.every(e=>e.missingFields.length===2)).toBe(true);expect(response.status).toBe('partial');
});
it('does not fill a missing counterpart with the available entity evidence',async()=>{
  mocks.search.mockImplementation(async(_u,_q,_v,filters)=>filters.structuredProductTerms[0]==='Fixture Alpha'?[chunk('a')]:[]);
  const response=await tool.execute(input,context);
  expect(response.data).toMatchObject({entities:[{entity:'Fixture Alpha'},{entity:'Fixture Beta',evidence:[],missingFields:input.attributes}]});
});
it('discards revoked sources and facts and keeps raw matches unverified',async()=>{
  mocks.authorize.mockResolvedValue(new Set());
  mocks.facts.mockResolvedValue([{id:'fact',attributeKey:'ethernet_port_count',status:'verified',typedValue:9,unit:'port',chunkId:'revoked'}]);
  const response=await tool.execute(input,context);
  expect(response.data).toMatchObject({entities:[{evidence:[],verifiedFacts:[],missingFields:input.attributes},{evidence:[],verifiedFacts:[]}]});
});
it('reports conflicts rather than silently choosing one verified value',async()=>{
  mocks.facts.mockResolvedValue([2,3].map(value=>({id:`fact${value}`,attributeKey:'ethernet_port_count',status:'verified',typedValue:value,unit:'port',chunkId:'a'})));
  const response=await tool.execute(input,context);
  expect(response.data).toMatchObject({entities:[{fields:[{status:'conflicting'},{status:'missing'}]},{fields:[{status:'conflicting'},{status:'missing'}]}]});
});
it('reserves separate bounded evidence space for both entities',async()=>{
  mocks.search.mockImplementation(async(_u,q)=>Array.from({length:4},(_,index)=>chunk(`${q}:${index}`)));
  const response=await tool.execute(input,context);
  const packet=response.data as {entities:Array<{evidence:RetrievedChunk[]}>};
  expect(packet.entities.map(e=>e.evidence.length)).toEqual([4,4]);
});
it('refuses out-of-scope product access without a database call',async()=>{
  const response=await tool.execute(input,{...context,knowledgeScope:['company']});
  expect(response.data).toMatchObject({kind:'deny'});expect(mocks.search).not.toHaveBeenCalled();expect(mocks.facts).not.toHaveBeenCalled();
});
it('rejects duplicate entities, extra account fields and oversized field sets',()=>{
  expect(()=>tool.input.parse({...input,entities:['Same','same']})).toThrow();
  expect(()=>tool.input.parse({...input,userId:'other'})).toThrow();
  expect(()=>tool.input.parse({...input,attributes:Array.from({length:7},(_,i)=>`field${i}`)})).toThrow();
});
