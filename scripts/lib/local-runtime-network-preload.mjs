import {setGlobalDispatcher,EnvHttpProxyAgent,fetch as proxyFetch} from 'undici';
if(process.env.HTTP_PROXY||process.env.HTTPS_PROXY){setGlobalDispatcher(new EnvHttpProxyAgent());globalThis.fetch=proxyFetch;}
