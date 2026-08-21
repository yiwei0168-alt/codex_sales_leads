/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS bootstrap repairs the Windows process before ESM/tsx startup. */
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { loadEnvConfig } = require("@next/env");

require("./patch-node-user.cjs");

const preloadPath = path.resolve(__dirname, "patch-node-user.cjs").replaceAll("\\", "/");
const preloadOption = `--require=${preloadPath}`;
if (!process.env.NODE_OPTIONS?.includes(preloadPath)) {
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, preloadOption].filter(Boolean).join(" ");
}

if (process.env.RUN_TSX_ENV_READY === "1") {
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
    const { ProxyAgent, fetch, setGlobalDispatcher } = require("undici");
    setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY || process.env.HTTP_PROXY));
    globalThis.fetch = fetch;
  }
  try {
    os.userInfo();
  } catch {
    os.userInfo = () => ({
      username: process.env.USERNAME || "codex",
      uid: -1,
      gid: -1,
      shell: null,
      homedir: process.cwd(),
    });
  }
  import("../node_modules/tsx/dist/cli.mjs");
} else {
  loadEnvConfig(process.cwd());
  const child = spawn(process.execPath, ["--use-env-proxy", __filename, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, RUN_TSX_ENV_READY: "1" },
  });
  child.once("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
}
