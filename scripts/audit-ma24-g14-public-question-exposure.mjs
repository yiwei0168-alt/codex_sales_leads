import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";

const candidateArg = process.argv.find(argument => argument.startsWith("--candidate-file="));
const privateRoot = realpathSync(resolve("tmp/ma24-independent-quarantine"));
let privateCandidates;
if (candidateArg) {
  const candidatePath = realpathSync(resolve(candidateArg.slice("--candidate-file=".length)));
  if (!candidatePath.startsWith(`${privateRoot}${sep}`)) throw new Error("candidate file must be in the private quarantine directory");
  execFileSync("git", ["check-ignore", "-q", "--", candidatePath]);
  const input = JSON.parse(readFileSync(candidatePath, "utf8"));
  if (!Array.isArray(input.cases) || input.cases.length === 0) throw new Error("candidate file must contain nonempty cases");
  privateCandidates = input.cases.map(item => {
    const caseId = item.caseId || item.id;
    const question = item.query || item.question;
    if (typeof caseId !== "string" || typeof question !== "string" || question.trim().length < 20)
      throw new Error("each candidate requires a caseId and complete question");
    const answer = item.expectedAnswer;
    if (answer !== undefined && (typeof answer !== "string" || answer.trim().length < 20))
      throw new Error("expectedAnswer must be complete when supplied");
    return { caseId, question, answer };
  });
}
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
const historyExactCommits = value => execFileSync("git", ["log", "--all", "--format=%H", `-S${value}`, "--", "."],
  { encoding: "utf8" }).trim().split(/\s+/).filter(Boolean);
let report;
if (privateCandidates) {
  report = { mode: "private-candidates", trackedTextFiles: textFiles.length,
    cases: privateCandidates.map(item => ({ caseId: item.caseId, question: hits(item.question),
      localGitHistoryExactCommits: historyExactCommits(item.question),
      ...(item.answer ? { answer: hits(item.answer), localGitHistoryExactAnswerCommits: historyExactCommits(item.answer) } : {}) })) };
} else {
  const sources = JSON.parse(readFileSync("tmp/ma24-independent-quarantine/approved-five-source-set-staging-v1.json", "utf8")).cases;
  const gold = JSON.parse(readFileSync("tmp/ma24-independent-quarantine/approved-five-gold-staging-v1.json", "utf8")).cases;
  const provisional = JSON.parse(readFileSync("tmp/ma24-independent-quarantine/g14-current-draft-pool-v10-nist-mat-2026-10-16.json", "utf8"));
  report = { mode: "historical-pool", trackedTextFiles: textFiles.length, approvedCases: sources.map(source => {
    const answer = gold.find(item => item.caseId === source.caseId);
    return { caseId: source.caseId, question: hits(source.query), answer: hits(answer.expectedAnswer) };
  }), provisionalPublicationCases: provisional.publicationRows.map(row => ({
    caseId: row.id, exactQuestionPaths: hits(row.question).exact,
  })), provisionalSecurityCases: provisional.securityAnnex.map(row => ({
    caseId: row.id, exactQuestionPaths: hits(row.question).exact,
  })) };
}
const output = JSON.stringify(report, null, 2);
const outputPath = process.argv.find((argument, index) => index > 1 && !argument.startsWith("--"));
if (outputPath) writeFileSync(outputPath, `${output}\n`, "utf8");
else console.log(output);
const exposed = privateCandidates
  ? report.cases.some(item => item.question.exact.length || item.localGitHistoryExactCommits.length
    || item.answer?.exact.length || item.localGitHistoryExactAnswerCommits?.length)
  : [...report.approvedCases.map(item => item.question.exact.length),
    ...report.provisionalPublicationCases.map(item => item.exactQuestionPaths.length),
    ...report.provisionalSecurityCases.map(item => item.exactQuestionPaths.length)].some(Boolean);
if (process.argv.includes("--fail-on-exposure") && exposed) process.exitCode = 2;
