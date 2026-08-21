/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS preload must run before ESM/tsx startup. */
if (typeof process.geteuid !== "function") {
  Object.defineProperty(process, "geteuid", {
    configurable: true,
    value: () => -1,
  });
}

if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  const { ProxyAgent, fetch, setGlobalDispatcher } = require("undici");
  const proxyAgent = new ProxyAgent(process.env.HTTPS_PROXY || process.env.HTTP_PROXY);
  setGlobalDispatcher(proxyAgent);
  globalThis.fetch = fetch;
}
