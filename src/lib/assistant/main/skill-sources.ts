import { lookup } from "node:dns/promises";
import {createHash} from "node:crypto";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { z } from "zod";
import { safeSkillPath, skillImportSchema } from "./skills";

const sourceSchema = z.object({ kind: z.enum(["url","github"]), name: z.string().min(1).max(120),
  url: z.url().max(1000).optional(), repository: z.url().max(500).optional(), ref: z.string().min(1).max(120).optional(), directory: z.string().max(180).optional(),
  skillId: z.uuid().optional(), expectedVersion: z.number().int().min(1).optional() }).strict().superRefine((value, context) => {
    if (value.kind === "url" && (!value.url || value.repository || value.ref || value.directory)) context.addIssue({code:"custom",message:"URL source requires only a SKILL.md URL"});
    if (value.kind === "github" && (!value.repository || !value.ref || value.url)) context.addIssue({code:"custom",message:"GitHub source requires repository and ref"});
  });
export { sourceSchema as skillSourceSchema };
export type SkillSource = z.infer<typeof sourceSchema>;

const blockedV4 = new BlockList(), blockedV6 = new BlockList();
for (const [subnet, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) blockedV4.addSubnet(subnet, prefix, "ipv4");
for (const [subnet, prefix] of [["::", 3], ["4000::", 2], ["8000::", 1], ["2001:db8::", 32], ["::ffff:0:0", 96]] as const) blockedV6.addSubnet(subnet, prefix, "ipv6");
export function publicSkillAddress(address: string) {
  const family = isIP(address);
  return family === 4 ? !blockedV4.check(address, "ipv4") : family === 6 && !blockedV6.check(address, "ipv6");
}
export function validateSkillSourceUrl(input: string, githubOnly = false): URL {
  const url = new URL(input);
  const internalTreeQuery = url.hostname === "api.github.com" && url.search === "?recursive=1";
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || (url.search && !internalTreeQuery) || !url.hostname || isIP(url.hostname)
    || /(^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname.toLowerCase())
    || (githubOnly && url.hostname !== "github.com")) throw new Error("Skill source must be a public HTTPS URL without credentials or a custom port");
  return url;
}
async function publicLookup(hostname: string) {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => !publicSkillAddress(item.address))) throw new Error("Skill source DNS resolved to a non-public address");
  return addresses[0];
}
/** DNS is checked and pinned to the TLS connection, with no redirect or proxy bypass. */
export async function readPublicSkillUrl(input: string, limit = 220_000): Promise<Buffer> {
  let url = validateSkillSourceUrl(input);
  for (let redirect = 0; redirect <= 3; redirect++) {
    const address = await publicLookup(url.hostname);
    const response = await new Promise<{ status: number; location?: string; body: Buffer }>((resolve, reject) => {
      const req = httpsRequest(url, { method: "GET", timeout: 15_000, headers: { "User-Agent": "SalesAgentSkillImporter/1.0", Accept: "application/json,text/plain,text/markdown;q=0.9" },
        lookup: (_hostname, options, callback) => {
          if (typeof options === "object" && options.all) callback(null, [address] as never);
          else callback(null, address.address, address.family);
        } }, res => {
        const chunks: Buffer[] = []; let size = 0;
        res.on("data", (chunk: Buffer) => { size += chunk.length; if (size > limit) req.destroy(new Error("Skill source exceeds download limit")); else chunks.push(chunk); });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, location: res.headers.location, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      });
      req.on("timeout", () => req.destroy(new Error("Skill source timed out")));
      req.on("error", reject);
      req.end();
    });
    if ([301, 302, 303, 307, 308].includes(response.status) && response.location) {
      if (redirect === 3) throw new Error("Skill source redirected too many times");
      url = validateSkillSourceUrl(new URL(response.location, url).toString());
      continue;
    }
    if (response.status !== 200) throw new Error(`Skill source HTTP ${response.status}`);
    return response.body;
  }
  throw new Error("Skill source redirected too many times");
}
function parseJson<T>(buffer: Buffer): T { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)) as T; }
function utf8(buffer: Buffer) { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
function declaredDependencies(files: Record<string,string>) {
  return Object.keys(files).filter(path => /(^|\/)(?:requirements\.txt|pyproject\.toml|package\.json|environment\.ya?ml|Pipfile|uv\.lock)$/i.test(path)).map(path => `manifest:${path}`).slice(0,30);
}
function githubRepository(input: string) {
  const url = validateSkillSourceUrl(input, true);
  const parts = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);
  if (parts.length !== 2 || parts.some(part => !/^[a-z0-9_.-]{1,100}$/i.test(part))) throw new Error("GitHub source must identify one owner/repository");
  return { owner: parts[0], repo: parts[1].replace(/\.git$/i, "") };
}
export async function loadSkillSource(raw: SkillSource, read = readPublicSkillUrl): Promise<z.infer<typeof skillImportSchema>> {
  const source = sourceSchema.parse(raw);
  if (source.kind === "url") {
    const url = validateSkillSourceUrl(source.url!);
    if (!/\/SKILL\.md$/i.test(url.pathname)) throw new Error("Specified URL must address SKILL.md");
    const content = utf8(await read(url.toString(), 200_000));
    return skillImportSchema.parse({ name: source.name, source: url.toString(), files: { "SKILL.md": content }, dependencies: [], skillId: source.skillId, expectedVersion: source.expectedVersion });
  }
  const { owner, repo } = githubRepository(source.repository!);
  if (!/^[a-z0-9._/-]+$/i.test(source.ref!) || source.ref!.includes("..") || source.ref!.includes("//") || source.ref!.startsWith("-") || source.ref!.startsWith("/")) throw new Error("Invalid Git ref");
  const directory = (source.directory??"").replace(/\/$/, "");
  if (directory && !safeSkillPath(directory)) throw new Error("Invalid Skill directory");
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const commit = parseJson<{ sha: string; commit: { tree: { sha: string } } }>(await read(`${api}/commits/${encodeURIComponent(source.ref!)}`, 100_000));
  if (!/^[a-f0-9]{40}$/.test(commit.sha) || !/^[a-f0-9]{40}$/.test(commit.commit?.tree?.sha)) throw new Error("Git commit identity missing");
  const tree = parseJson<{ truncated: boolean; tree: Array<{ path: string; type: string; sha: string; size?: number }> }>(await read(`${api}/git/trees/${commit.commit.tree.sha}?recursive=1`, 2_000_000));
  if (tree.truncated || !Array.isArray(tree.tree)) throw new Error("Git tree incomplete");
  const prefix = directory ? `${directory}/` : "";
  const entries = tree.tree.filter(item => item.type === "blob" && item.path.startsWith(prefix)).map(item => ({ ...item, relative: item.path.slice(prefix.length) }));
  if (!entries.some(item => item.relative === "SKILL.md") || entries.length > 50 || entries.some(item => !safeSkillPath(item.relative) || !/^[a-f0-9]{40}$/.test(item.sha) || !Number.isSafeInteger(item.size) || (item.size ?? 0) > 200_000)
    || entries.reduce((sum, item) => sum + (item.size ?? 0), 0) > 1_000_000) throw new Error("Git Skill package missing, too large or unsafe");
  const files: Record<string, string> = {};
  for (const entry of entries) {
    const blob = parseJson<{ encoding: string; content: string; size: number }>(await read(`${api}/git/blobs/${entry.sha}`, 300_000));
    if (blob.encoding !== "base64" || blob.size !== entry.size) throw new Error("Git blob encoding or size changed");
    const buffer = Buffer.from(blob.content.replace(/\s/g, ""), "base64");
    if (buffer.length !== entry.size) throw new Error("Git blob size mismatch");
    const actualSha=createHash("sha1").update(`blob ${buffer.length}\0`).update(buffer).digest("hex");
    if(actualSha!==entry.sha)throw new Error("Git blob identity mismatch");
    files[entry.relative] = utf8(buffer);
  }
  return skillImportSchema.parse({ name: source.name, source: `github:${owner}/${repo}@${commit.sha}/${directory}`, files, dependencies: declaredDependencies(files), skillId: source.skillId, expectedVersion: source.expectedVersion });
}
