import {afterEach,expect,it,vi} from 'vitest';
import {Annotation,START,END,StateGraph} from '@langchain/langgraph';
import {buildLeadMarketPlaybook} from './playbook';
import {BudgetDeniedError} from '@/lib/billing/policy';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('keeps playbook requests buffered under graph message-stream callbacks',async()=>{
 vi.stubEnv('OPENROUTER_API_KEY','synthetic-never-sent');vi.stubEnv('LEAD_PLANNER_MODEL','gpt-5.6-sol');vi.stubEnv('OPENROUTER_BASE_URL','https://openrouter.ai/api/v1');
 const requests:Request[]=[];
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{requests.push(new Request(input,init));throw new BudgetDeniedError('missing-tariff');});
 const graph=new StateGraph(Annotation.Root({input:Annotation<string>()})).addNode('plan',async()=>{await buildLeadMarketPlaybook({countryCode:'GB',countryName:'United Kingdom',objective:'new-market',roles:['Distributor'],targetCount:3,queryLanguage:'English',userRequest:'Synthetic acceptance'},[]);return {};}).addEdge(START,'plan').addEdge('plan',END).compile();
 try{for await(const chunk of await graph.stream({input:'synthetic'},{streamMode:['messages','updates']})){void chunk;}}catch(error){expect(error).toMatchObject({code:'missing-tariff'});}
 expect(requests).toHaveLength(1);expect((await requests[0].json()).stream).toBe(false);
},15000);
