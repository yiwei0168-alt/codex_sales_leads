import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const {getRagConfig}=await import("../src/lib/rag/config");
const {query,tenantQuery,getPool}=await import("../src/lib/rag/db");
try{
  const config=getRagConfig();
  const endpoint=(value:string|undefined)=>{try{const u=new URL(value||"");return `${u.origin}${u.pathname}`;}catch{return "not-configured";}};
  console.log(JSON.stringify({models:{embedding:config.embeddingModel,generation:config.generationModel,
    intent:process.env.KIMI_INTENT_LIGHT_MODEL||"kimi-k2.6",planning:process.env.KIMI_INTENT_MODEL||process.env.KIMI_MODEL||"kimi-k3",
    deepseek:process.env.DEEPSEEK_MODEL||"deepseek-v4-flash",claude:process.env.CLAUDE_MODEL||"default"},
    endpoints:{embedding:endpoint(config.embeddingBaseUrl),generation:endpoint(config.openaiBaseUrl),kimi:endpoint(process.env.KIMI_BASE_URL||"https://api.moonshot.cn/v1"),deepseek:endpoint(process.env.DEEPSEEK_BASE_URL||"https://api.deepseek.com")},
    credentialsPresent:{embedding:Boolean(config.embeddingApiKey),openrouter:Boolean(config.openaiApiKey),kimi:Boolean(process.env.KIMI_API_KEY),deepseek:Boolean(process.env.DEEPSEEK_API_KEY),mailboxEncryption:Boolean(process.env.MAILBOX_CREDENTIAL_KEY)},
    proxyConfigured:Boolean(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)}));
  const users=await query<{id:string}>("select id from app_user where status='active'");
  let activeWorkspaceOwners=0,activeMailboxes=0;
  for(const user of users){
    const workspaces=await tenantQuery<{id:string}>(user.id,"select id from market_workspace where owner_id=$1 and slug='global-sales' and status='active'",[user.id]);
    if(!workspaces.length)continue;
    activeWorkspaceOwners++;
    const rows=await tenantQuery<{count:number}>(user.id,"select count(*)::int as count from mailbox_connection where user_id=$1 and status='active'",[user.id]);
    activeMailboxes+=rows[0].count;
  }
  console.log(JSON.stringify({activeWorkspaceOwners,activeMailboxes,paidCalls:0,mailSent:0}));
}catch{console.error("Release profile could not be fully verified; no configuration values or credentials emitted.");process.exitCode=1;}finally{await getPool().end();}
