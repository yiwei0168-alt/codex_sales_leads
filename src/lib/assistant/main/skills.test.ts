import { describe, expect, it } from "vitest";
import { safeSkillPath, skillImportSchema,instructionOnlySkill } from "./skills";
import { sandboxArguments } from "./sandbox";
describe("Skill package and sandbox boundary", () => {
  it('limits automatic eligibility to instruction files without embedded runnable examples',()=>{
    expect(instructionOnlySkill({'SKILL.md':'Read evidence','references/guide.txt':'Compare originals'})).toBe(true);
    expect(instructionOnlySkill({'SKILL.md':'```powershell\nStart-Process app\n```'})).toBe(false);
    expect(instructionOnlySkill({'SKILL.md':'#!/bin/sh\necho run'})).toBe(false);
    expect(instructionOnlySkill({})).toBe(false);
  });
  it.each(["../secrets", "/etc/passwd", "C:/secret", "refs/../../a", "a\\b", ".env", "node_modules/pkg/index.js"])("rejects unsafe package path %s", path => {
    expect(safeSkillPath(path)).toBe(false);
  });
  it("accepts instructions and references but rejects embedded private keys", () => {
    expect(skillImportSchema.safeParse({ name: "test", source: "user", files: { "SKILL.md": "Read references/guide.md", "references/guide.md": "Task method" } }).success).toBe(true);
    expect(skillImportSchema.safeParse({ name: "test", source: "user", files: { "SKILL.md": "-----BEGIN PRIVATE KEY-----" } }).success).toBe(false);
  });
  it("uses an isolated non-root container without network or host credential mounts", () => {
    const args = sandboxArguments({ directory: "F:/workspace/tmp/agent-sandbox/task-abc", entry: "scripts/check.py", image: "codex-agent-sandbox:1" });
    expect(args).toContain("--network=none"); expect(args).toContain("--read-only"); expect(args).toContain("--cap-drop=ALL");
    expect(args).toContain("--user=65534:65534"); expect(args.filter(v => v.includes("source="))).toHaveLength(1);
    expect(args).toContain("--entrypoint=timeout");
    expect(args.join(" ")).not.toContain("docker.sock"); expect(args).not.toContain("--env-file");
  });
});
