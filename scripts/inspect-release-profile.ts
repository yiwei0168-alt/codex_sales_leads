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
  const owners=await query<{owner_id:string}>("select distinct w.owner_id from market_workspace w join app_user u on u.id=w.owner_id where w.slug='global-sales' and w.status='active' and u.status='active'");
  let activeMailboxes=0;for(const owner of owners){const rows=await tenantQuery<{count:number}>(owner.owner_id,"select count(*)::int as count from mailbox_connection where user_id=$1 and status='active'",[owner.owner_id]);activeMailboxes+=rows[0].count;}
  console.log(JSON.stringify({activeWorkspaceOwners:owners.length,activeMailboxes,paidCalls:0,mailSent:0}));
}catch{console.error("Release profile could not be fully verified; no configuration values or credentials emitted.");process.exitCode=1;}finally{await getPool().end();}
