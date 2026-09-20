import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, realpath, rm } from "node:fs/promises";
import { resolve, dirname, join, relative, isAbsolute } from "node:path";
import { safeSkillPath } from "./skills";
const execute = promisify(execFile);

/** No shell, host repository/socket/credentials, or network is exposed to Skill code. */
export function sandboxArguments(input: { directory: string; entry: string; image: string }) {
  if (!safeSkillPath(input.entry) || !/\.(py|mjs|js)$/.test(input.entry)) throw new Error("Unsupported script entry");
  if (!/^[a-z0-9][a-z0-9._/:@-]{1,200}$/i.test(input.image)) throw new Error("Invalid sandbox image");
  if (/[,\r\n]/.test(input.directory)) throw new Error("Invalid sandbox directory");
  return ["run", "--rm", "--init", "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--user=65534:65534",
    "--pids-limit=64", "--memory=256m", "--cpus=1", "--tmpfs=/tmp:rw,noexec,nosuid,size=64m", "--workdir=/input",
    "--mount", `type=bind,source=${input.directory},target=/input,readonly`, "--entrypoint=timeout", input.image,
    "45s", input.entry.endsWith(".py") ? "python3" : "node", `/input/${input.entry}`];
}
export async function runSkillScript(files: Record<string, string>, entry: string, inputs: string) {
  const image = process.env.AGENT_SANDBOX_IMAGE?.trim();
  if (!image) return { status: "unavailable" as const, missing: ["AGENT_SANDBOX_IMAGE (Node/Python Linux image)"] };
  if (!Object.hasOwn(files, entry) || !safeSkillPath(entry)) throw new Error("Script is not in the pinned Skill");
  const root = resolve("tmp", "agent-sandbox");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "task-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      if (!safeSkillPath(path) || path === "task-input.json") throw new Error("Invalid or reserved Skill path");
      const destination = join(directory, path);
      await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, content, "utf8");
    }
    await writeFile(join(directory, "task-input.json"), inputs, "utf8");
    try {
      const output = await execute("docker", sandboxArguments({ directory, entry, image }), { timeout: 55_000, maxBuffer: 512_000, windowsHide: true });
      return { status: "success" as const, stdout: output.stdout, stderr: output.stderr, network: "disabled", dependencies: "image-only" };
    } catch {
      return { status: "unavailable" as const, missing: ["Sandbox unavailable, script failed, or execution limit reached; no host fallback"] };
    }
  } finally {
    const actual = await realpath(directory);
    const rel = relative(await realpath(root), actual);
    if (!rel.startsWith("..") && !isAbsolute(rel) && rel.startsWith("task-")) await rm(actual, { recursive: true, force: true });
  }
}
