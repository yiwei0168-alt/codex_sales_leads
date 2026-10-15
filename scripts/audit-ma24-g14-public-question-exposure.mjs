import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const sources = JSON.parse(readFileSync("tmp/ma24-independent-quarantine/approved-five-source-set-staging-v1.json", "utf8")).cases;
const gold = JSON.parse(readFileSync("tmp/ma24-independent-quarantine/approved-five-gold-staging-v1.json", "utf8")).cases;
const provisional = JSON.parse(readFileSync("tmp/ma24-independent-quarantine/g14-current-draft-pool-v10-nist-mat-2026-10-16.json", "utf8"));
const tracked = execFileSync("git", ["ls-files", "-z"]).toString("utf8").split("\0").filter(Boolean);
const textFiles = tracked.filter(path => /\.(?:md|json|jsonl|txt|ts|tsx|js|mjs|py|csv|yml|yaml)$/i.test(path));
const contents = new Map(textFiles.map(path => [path, readFileSync(path, "utf8")]));
const clean = value => String(value).normalize("NFKC").replace(/[\p{P}\p{S}\s]/gu, "").toLowerCase();
const normalized = new Map([...contents].map(([path, value]) => [path, clean(value)]));
const hits = (value, window = 28) => {
  const target = clean(value);
  const samples = target.length < window ? [target] : Array.from({ length: Math.ceil((target.length - window + 1) / 14) },
    (_, index) => target.slice(Math.min(index * 14, target.length - window), Math.min(index * 14, target.length - window) + window));
  const exact = [...contents].filter(([, content]) => content.includes(value)).map(([path]) => path);
  const fragments = [...normalized].flatMap(([path, content]) => {
    const count = samples.filter(sample => sample.length >= 20 && content.includes(sample)).length;
    return count ? [{ path, count }] : [];
  }).sort((a, b) => b.count - a.count).slice(0, 12);
  return { exact, fragments };
};
const report = { trackedTextFiles: textFiles.length, approvedCases: sources.map(source => {
  const answer = gold.find(item => item.caseId === source.caseId);
  return { caseId: source.caseId, question: hits(source.query), answer: hits(answer.expectedAnswer) };
}), provisionalPublicationCases: provisional.publicationRows.map(row => ({
  caseId: row.id, exactQuestionPaths: hits(row.question).exact,
})), provisionalSecurityCases: provisional.securityAnnex.map(row => ({
  caseId: row.id, exactQuestionPaths: hits(row.question).exact,
})) };
const output = JSON.stringify(report, null, 2);
const outputPath = process.argv.find((argument, index) => index > 1 && !argument.startsWith("--"));
if (outputPath) writeFileSync(outputPath, `${output}\n`, "utf8");
else console.log(output);
if (process.argv.includes("--fail-on-exposure") && [
  ...report.approvedCases.map(item => item.question.exact.length),
  ...report.provisionalPublicationCases.map(item => item.exactQuestionPaths.length),
  ...report.provisionalSecurityCases.map(item => item.exactQuestionPaths.length),
].some(Boolean)) process.exitCode = 2;
