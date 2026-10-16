import { spawn } from "node:child_process";
import { packageSkillRuntimeSource } from "./package-skill-runtime-source.mjs";
import { join } from "node:path";

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

child.on("exit", async (code, signal) => {
  if (signal) {
    console.error(`Next build terminated by ${signal}`);
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
    if (code === 0) {
      try {
        await packageSkillRuntimeSource(process.cwd(), join(process.env.NEXT_DIST_DIR || '.next', 'standalone'));
      } catch (error) {
        console.error('Skill runtime source packaging failed', error);
        process.exitCode = 1;
      }
    }
  }
});
