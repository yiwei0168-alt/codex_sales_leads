import { describe, expect, it } from "vitest";
import {createHash} from "node:crypto";
import {loadSkillSource,publicSkillAddress,validateSkillSourceUrl} from "./skill-sources";

describe("public Skill source import", () => {
  it.each(["http://example.com/SKILL.md","https://localhost/SKILL.md","https://127.0.0.1/SKILL.md","https://user:pass@example.com/SKILL.md","https://example.com:8443/SKILL.md","https://example.com/SKILL.md?token=secret","https://metadata.google.internal/SKILL.md"])("rejects unsafe source %s", value => {
    expect(() => validateSkillSourceUrl(value)).toThrow();
  });
  it("rejects local and reserved DNS answers before transport", () => {
    for(const ip of ["127.0.0.1","10.1.2.3","169.254.169.254","172.20.0.1","192.168.1.4","::1","fc00::1","fe80::1","::ffff:127.0.0.1"])expect(publicSkillAddress(ip)).toBe(false);
    expect(publicSkillAddress("8.8.8.8")).toBe(true);
    expect(publicSkillAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("loads one public SKILL.md with a content-validated package", async () => {
    const calls:string[]=[];
    const result=await loadSkillSource({kind:"url",name:"Method",url:"https://example.com/SKILL.md"},async url=>{calls.push(url);return Buffer.from("# Public method\n");});
    expect(calls).toEqual(["https://example.com/SKILL.md"]);
    expect(result.files).toEqual({"SKILL.md":"# Public method\n"});
    await expect(loadSkillSource({kind:"url",name:"Method",url:"https://example.com/SKILL.md"},async()=>Buffer.from("-----BEGIN PRIVATE KEY-----"))).rejects.toThrow();
  });
  it("pins a GitHub directory to the resolved commit and excludes unrelated files", async () => {
    const gitSha=(content:string)=>createHash("sha1").update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest("hex");
    const commitSha="a".repeat(40),treeSha="b".repeat(40),guideSha=gitSha("Guide"),skillSha=gitSha("# Sales\n");
    const responses=new Map<string,unknown>([
      [`https://api.github.com/repos/team/repo/commits/main`,{sha:commitSha,commit:{tree:{sha:treeSha}}}],
      [`https://api.github.com/repos/team/repo/git/trees/${treeSha}?recursive=1`,{truncated:false,tree:[
        {path:"skills/sales/SKILL.md",type:"blob",sha:skillSha,size:8},
        {path:"skills/sales/references/guide.md",type:"blob",sha:guideSha,size:5},
        {path:"other/secret.txt",type:"blob",sha:"e".repeat(40),size:8},
      ]}],
      [`https://api.github.com/repos/team/repo/git/blobs/${skillSha}`,{encoding:"base64",content:Buffer.from("# Sales\n").toString("base64"),size:8}],
      [`https://api.github.com/repos/team/repo/git/blobs/${guideSha}`,{encoding:"base64",content:Buffer.from("Guide").toString("base64"),size:5}],
    ]);
    const calls:string[]=[];
    const result=await loadSkillSource({kind:"github",name:"Sales",repository:"https://github.com/team/repo",ref:"main",directory:"skills/sales"},async url=>{
      calls.push(url);const value=responses.get(url);if(!value)throw new Error("Unexpected source");return Buffer.from(JSON.stringify(value));
    });
    expect(result.source).toBe(`github:team/repo@${commitSha}/skills/sales`);
    expect(result.files).toEqual({"SKILL.md":"# Sales\n","references/guide.md":"Guide"});
    expect(calls).toHaveLength(4);
    expect(calls.join(" ")).not.toContain("secret.txt");
  });
  it("stops on a truncated or unsafe Git tree before reading blobs", async () => {
    const calls:string[]=[];
    const read=async(url:string)=>{calls.push(url);return Buffer.from(JSON.stringify(calls.length===1
      ? {sha:"a".repeat(40),commit:{tree:{sha:"b".repeat(40)}}}
      : {truncated:false,tree:[{path:"skills/test/../secret",type:"blob",sha:"c".repeat(40),size:4},{path:"skills/test/SKILL.md",type:"blob",sha:"d".repeat(40),size:5}]}));};
    await expect(loadSkillSource({kind:"github",name:"Test",repository:"https://github.com/team/repo",ref:"main",directory:"skills/test"},read)).rejects.toThrow(/unsafe/);
    expect(calls).toHaveLength(2);
  });
});
