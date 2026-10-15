import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ma24LocalSourceClosure } from "../../../../scripts/lib/ma24-local-source-closure";

describe("MA24 G15 local source closure", () => {
  it("binds a transitive dependency and detects its byte drift", async () => {
    const root = await mkdtemp(path.resolve(process.cwd(), "tmp", "ma24-source-closure-"));
    try {
      await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: {
        module: "esnext", moduleResolution: "bundler", target: "es2017" } }));
      await writeFile(path.join(root, "entry.ts"), "import './middle';\n");
      await writeFile(path.join(root, "middle.ts"), "export { value } from './leaf';\n");
      await writeFile(path.join(root, "leaf.ts"), "export const value = 1;\n");
      const first = await ma24LocalSourceClosure(root, ["entry.ts"]);
      expect(Object.keys(first)).toEqual(["entry.ts", "leaf.ts", "middle.ts"]);
      expect(first["leaf.ts"]).toBe(createHash("sha256").update("export const value = 1;\n").digest("hex"));
      await writeFile(path.join(root, "leaf.ts"), "export const value = 2;\n");
      const second = await ma24LocalSourceClosure(root, ["entry.ts"]);
      expect(second["leaf.ts"]).not.toBe(first["leaf.ts"]);
      expect(second["entry.ts"]).toBe(first["entry.ts"]);
      await writeFile(path.join(root, "middle.ts"), "import('./missing');\n");
      await expect(ma24LocalSourceClosure(root, ["entry.ts"]))
        .rejects.toThrow("MA24 local import unresolved");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
