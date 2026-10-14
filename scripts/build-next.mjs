import { spawn } from "node:child_process";

// Next starts a separate TypeScript process, so the heap limit must be inherited.
const existingOptions = process.env.NODE_OPTIONS ?? "";
const nodeOptions = /(?:^|\s)--max-old-space-size(?:=|\s)/.test(existingOptions)
  ? existingOptions
  : `${existingOptions} --max-old-space-size=8192`.trim();

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Next build terminated by ${signal}`);
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
