import{afterEach,expect,it,vi}from'vitest';import{buildLeadMarketPlaybook}from'./playbook';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('does not resend a purchased response when structured-output SDK parsing fails',async()=>{
 vi.stubEnv('OPENROUTER_API_KEY','fixture-never-sent');vi.stubEnv('LEAD_PLANNER_MODEL','anthropic/claude-sonnet-5.5');vi.stubEnv('OPENROUTER_BASE_URL','https://openrouter.ai/api/v1');
 const transport=vi.fn<typeof fetch>().mockImplementation(async()=>Response.json({id:'fixture',model:'anthropic/claude-sonnet-5.5',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'invalid JSON'}}],usage:{prompt_tokens:10,completion_tokens:2}}));vi.stubGlobal('fetch',transport);
 const result=await buildLeadMarketPlaybook({countryCode:'GB',countryName:'United Kingdom',roles:['Distributor'],targetCount:3,objective:'new-market',queryLanguage:'English',userRequest:'Synthetic parser recovery'},[]);
 expect(result.generatedBy).toBe('deterministic-fallback');expect(transport).toHaveBeenCalledOnce();expect(result.warnings.join(' ')).toContain('degraded safely');
},20000);
