import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({query:vi.fn(),search:vi.fn(),candidates:vi.fn(),hybrid:vi.fn(),browse:vi.fn(),read:vi.fn(),aggregate:vi.fn(),filter:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:mock.query,tenantTransaction:vi.fn()}));
vi.mock('@/lib/rag/repository',()=>({hybridSearch:mock.hybrid}));
vi.mock('./vectorless',()=>({searchDocuments:mock.search,currentCandidateDocuments:mock.candidates,modelTokensInQuery:()=>[],browseTree:mock.browse,readEvidence:mock.read,aggregateDocumentSet:mock.aggregate,filterDocumentSet:mock.filter}));
import {searchSessionDocuments,supplementSessionFromV3,browseSessionTree,readSessionEvidence,aggregateSessionDocuments,filterSessionDocuments} from './vectorless-session';
const current={id:'session',candidate_ids:['doc'],matched_count:1,search_used:1,navigation_used:0,evidence_used:0,agent_run_id:'run',run_id:'run',knowledge_scope:['product']};
beforeEach(()=>{
  vi.resetAllMocks();
  mock.query.mockImplementation(async(_user,sql:string)=>{
    if(sql.includes('left join agent_run'))return [current];
    if(sql.includes('select question'))return [{question:'fixture'}];
    if(sql.includes('select release_id'))return [{release_id:'release'}];
    return [{count:1,id:'session'}];
  });
  mock.search.mockResolvedValue([]);mock.hybrid.mockResolvedValue([{id:'chunk',documentId:'other'}]);
  mock.candidates.mockResolvedValue([]);mock.browse.mockResolvedValue([]);mock.read.mockResolvedValue(null);
  mock.aggregate.mockResolvedValue({count:0,documentIds:[]});mock.filter.mockResolvedValue({count:0,documentIds:[]});
});
it('uses persisted collection scope for search and fallback, not caller-provided filters',async()=>{
  await searchSessionDocuments('owner','session',Object.assign({market:'DE'},{collections:['company']}));
  expect(mock.search).toHaveBeenCalledWith('owner','fixture',{market:'DE',collections:['product']});
  await supplementSessionFromV3('owner','session');
  expect(mock.hybrid).toHaveBeenCalledWith('owner','fixture',null,expect.objectContaining({collections:['product']}),40);
  expect(mock.candidates).toHaveBeenCalledWith('owner',['other'],['product']);
});
it('reapplies saved scope to every tree and deterministic set operation',async()=>{
  await browseSessionTree('owner','session','doc');await readSessionEvidence('owner','session','node');
  await aggregateSessionDocuments('owner','session',['doc']);
  await filterSessionDocuments('owner','session',['doc'],{collection:'company'});
  expect(mock.browse).toHaveBeenCalledWith('owner','doc',null,0,200,['product']);
  expect(mock.read).toHaveBeenCalledWith('owner','node',['product']);
  expect(mock.aggregate).toHaveBeenCalledWith('owner',['doc'],['product']);
  expect(mock.filter).toHaveBeenCalledWith('owner',['doc'],{collection:'company'},['product']);
});
it('fails closed for corrupted scope or a missing bound run before any retrieval',async()=>{
  for(const patch of [{knowledge_scope:['unknown']},{run_id:null}]){
    mock.query.mockResolvedValueOnce([{...current,...patch}]);
    await expect(searchSessionDocuments('owner','session')).rejects.toThrow();
  }
  expect(mock.search).not.toHaveBeenCalled();
});
