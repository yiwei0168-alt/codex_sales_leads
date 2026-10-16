import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Ma24GoldSnapshot, Ma24SourceSetSnapshot } from './ma24-independent-comparison';

const textFile = /\.(?:md|mdx|json|jsonl|txt|ts|tsx|js|mjs|cjs|py|csv|tsv|ya?ml|html?|xml|svg|sql|sh|ps1|bat|toml|css|scss|ipynb|ini)$/i;

function git(cwd: string, args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function canonical(value: string) {
  return value.normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, '').toLowerCase();
}

/** Fail closed before enqueue and before a model task claims a frozen question. */
export function assertMa24FrozenSetNotPubliclyExposed(input: {
  sourceSet: Ma24SourceSetSnapshot;
  gold: Ma24GoldSnapshot;
  repositoryRoot?: string;
}) {
  const root = realpathSync(resolve(input.repositoryRoot ?? process.cwd()));
  const gitRoot = realpathSync(git(root, ['rev-parse', '--show-toplevel']).trim());
  if (gitRoot !== root) throw new Error('MA24 public exposure gate requires the repository root');

  const tracked = git(root, ['ls-files', '-z']).split('\0').filter(path => textFile.test(path));
  const contents = tracked.map(path => readFileSync(resolve(root, path), 'utf8'));
  const normalized = contents.map(canonical);
  const answers = new Map(input.gold.cases.map(item => [item.caseId, item.expectedAnswer]));
  if (answers.size !== input.sourceSet.cases.length)
    throw new Error('MA24 public exposure gate requires matching private Gold cases');

  for (const item of input.sourceSet.cases) {
    const answer = answers.get(item.caseId);
    if (!answer?.trim() || !item.query || item.query.length < 20)
      throw new Error(`MA24 public exposure gate has incomplete case ${item.caseId}`);
    for (const [kind, value] of [['question', item.query], ['answer', answer]] as const) {
      const target = canonical(value);
      // Short generic outcomes (for example, access denied) cannot establish answer exposure.
      if (kind === 'answer' && target.length < 28) continue;
      if (target.length < 20 || contents.some(content => content.includes(value)) ||
        normalized.some(content => content.includes(target)) ||
        git(root, ['log', '--all', '--format=%H', `-S${value}`, '--', '.']).trim())
        throw new Error(`MA24 ${kind} is publicly exposed or invalid: ${item.caseId}`);
    }
  }
  return { caseCount: input.sourceSet.cases.length, trackedTextFiles: tracked.length,
    publicQuestionOrAnswerExposure: false as const };
}
