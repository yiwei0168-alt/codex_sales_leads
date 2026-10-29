import{afterEach,expect,it,vi}from'vitest';import{buildLeadMarketPlaybook}from'./playbook';import{BudgetDeniedError}from'@/lib/billing/policy';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('sends a buffered strict-schema Anthropic playbook without unsupported temperature',async()=>{
 vi.stubEnv('OPENROUTER_API_KEY','fixture-never-sent');vi.stubEnv('LEAD_PLANNER_MODEL','anthropic/claude-sonnet-5.5');vi.stubEnv('OPENROUTER_BASE_URL','https://openrouter.ai/api/v1');
 const requests:Request[]=[];vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{requests.push(new Request(input,init));throw new BudgetDeniedError('missing-tariff');});
 await expect(buildLeadMarketPlaybook({countryCode:'GB',countryName:'United Kingdom',roles:['Distributor'],targetCount:3,objective:'new-market',queryLanguage:'English',userRequest:'Synthetic route test'},[])).rejects.toMatchObject({code:'missing-tariff'});
 expect(requests).toHaveLength(1);expect(requests[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
 const body=await requests[0].json();expect(body.model).toBe('anthropic/claude-sonnet-5.5');expect(body.max_tokens).toBe(4096);expect(body).not.toHaveProperty('max_completion_tokens');expect(body).not.toHaveProperty('temperature');expect(body.stream).toBe(false);expect(body.provider).toEqual({require_parameters:true,data_collection:'deny'});expect(body.response_format.json_schema.strict).toBe(true);expect(body.messages).toHaveLength(2);
},15000);
