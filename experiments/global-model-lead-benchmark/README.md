# Global Model Lead Benchmark

This experiment compares high-performance models from different providers on
their ability to discover Cudy Technology channel prospects across regions.

The benchmark permits only each model provider's native web-search or grounding
capability. External crawlers, browser automation, Tavily, third-party search
APIs, contact databases, and the project's existing lead data are excluded.

## Current stage

Country selection and the universal benchmark prompt are frozen. The next stage
is a single-country pilot. OpenAI, Claude, and DeepSeek passed native-search
verification. Kimi K2.6 is enabled after passing the same native-search flow;
Kimi K3 is excluded because its search-result continuation is currently
rejected by the provider tokenizer. The Germany pilot parameters and unified
runner are ready; no live country benchmark call has started.

Google Gemini remains an optional provider placeholder. It is disabled and does
not participate in current runs until its API credentials, model choice, and
provider-native Google Search grounding capability have been verified.

## Privacy and repository policy

- API credentials remain in `.env.local` and must never be committed.
- Existing private knowledge, mailbox content, contacts, and lead records are
  excluded from benchmark context.
- Raw results containing public contact details will remain local and ignored.
- Prompts, non-sensitive configuration, normalized aggregate scores, and
  redacted reports may be versioned after review.

## Germany pilot

The confirmed pilot uses German and English with the actual execution date. It
runs OpenAI, Claude, Kimi K2.6, and DeepSeek independently with the frozen
prompt. Each provider is limited to 8 native-search requests, 10,000 visible
output tokens, one continuation page, and 30 minutes. Failed requests are
recorded without automatic retry.

Run `npm run benchmark:verify` for a local-only configuration and validator
check. After explicit approval for live calls, run one provider at a time with
`npm run benchmark:pilot -- openai` (or another configured provider). Raw
responses are written below `runs/raw/`, which is ignored by Git.

Provider-added prose or a Markdown fence is tolerated only when it contains one
complete benchmark JSON object. Multiple, incomplete, or schema-invalid objects
remain failures. Rejected provider payloads are retained locally under
`runs/raw/*.rejected.json` for diagnosis and are never committed.

Prompt v1.0 remains preserved as the original baseline. Pilot v1.1 removes
repetition while retaining the same knowledge, evidence, privacy, role, and
output requirements. OpenAI uses Responses API streaming so long-running web
search emits progress events instead of relying on one silent synchronous
connection.
