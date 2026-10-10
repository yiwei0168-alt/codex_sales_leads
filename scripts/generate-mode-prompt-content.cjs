/* Approved prose is kept verbatim; --check detects drift without model calls. */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Standalone CommonJS generator, matching the .cjs entry point.
const fs = require('node:fs');
const source = fs.readFileSync('docs/AGENT_MODE_PROMPTS_DRAFT_2026-10-09.md', 'utf8').replaceAll('\r\n', '\n');
const sections = [...source.matchAll(/^## ([A-D])\. .+\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)];
if (sections.length !== 4) throw new Error('Expected four approved prompt sections');
const keys = ['common', 'quick', 'standard', 'deep'];
const output = JSON.stringify(Object.fromEntries(sections.map((s, i) => [keys[i], s[2].trim()])), null, 2) + '\n';
const path = 'src/lib/assistant/main/mode-prompt-content.json';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(path, 'utf8').replaceAll('\r\n', '\n') !== output) throw new Error('Approved prompt content drift');
} else fs.writeFileSync(path, output);
console.log('Approved common + three mode prompt sections: consistent');
