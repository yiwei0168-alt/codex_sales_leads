/** Hash the local literal import closure of the main Agent evaluation entries. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const localSpecifier = (value: string) => value.startsWith(".") || value.startsWith("@/");
const fileSha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function moduleSpecifiers(source: ts.SourceFile) {
  const found = new Set<string>();
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
      found.add(node.moduleSpecifier.text);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression))
      found.add(node.moduleReference.expression.text);
    if (ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      if (node.arguments.length < 1 ||
        (ts.isIdentifier(node.expression) && node.arguments.length !== 1))
        throw new Error(`Dynamic import cannot be frozen: ${source.fileName}`);
      const arg = node.arguments[0];
      if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) found.add(arg.text);
      else throw new Error(`Dynamic import cannot be frozen: ${source.fileName}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...found].filter(localSpecifier);
}

export async function ma24LocalSourceClosure(root: string, entries: string[]) {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) throw new Error("MA24 source closure requires tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  if (parsed.errors.length) throw new Error("MA24 source closure cannot parse tsconfig.json");
  const rootPath = path.resolve(root);
  const pending = entries.map(entry => path.resolve(rootPath, entry));
  const seen = new Set<string>();
  const hashes = new Map<string, string>();
  while (pending.length) {
    const filename = pending.pop()!;
    const relative = path.relative(rootPath, filename).replaceAll("\\", "/");
    if (relative.startsWith("../") || relative === ".." || path.isAbsolute(relative) ||
      relative.split("/").includes("node_modules"))
      throw new Error(`MA24 source closure escapes workspace: ${filename}`);
    if (seen.has(filename)) continue;
    seen.add(filename);
    const bytes = await readFile(filename);
    hashes.set(relative, fileSha(bytes));
    if (!/\.[cm]?[jt]sx?$/.test(filename)) continue;
    const source = ts.createSourceFile(filename, bytes.toString("utf8"), ts.ScriptTarget.Latest, true);
    for (const specifier of moduleSpecifiers(source)) {
      const resolved = ts.resolveModuleName(specifier, filename, parsed.options, ts.sys).resolvedModule;
      if (!resolved) throw new Error(`MA24 local import unresolved: ${relative} -> ${specifier}`);
      pending.push(path.resolve(resolved.resolvedFileName));
    }
  }
  return Object.fromEntries([...hashes].sort(([left], [right]) => left.localeCompare(right)));
}
