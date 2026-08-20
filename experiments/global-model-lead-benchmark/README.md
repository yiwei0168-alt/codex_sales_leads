# Global Model Lead Benchmark

This experiment compares high-performance models from different providers on
their ability to discover Cudy Technology channel prospects across regions.

The benchmark permits only each model provider's native web-search or grounding
capability. External crawlers, browser automation, Tavily, third-party search
APIs, contact databases, and the project's existing lead data are excluded.

## Current stage

Country selection and prompt v1.1 are frozen. Claude is temporarily skipped by
user decision. Kimi K2.6 is restored as the current model after passing both
basic and native-search preflights; Kimi K3 remains recorded as incompatible
after reproducing its tokenization failure. DeepSeek retains its verified
latency risk, and OpenAI uses Responses streaming through Lingyu.

On 2026-08-20, the Germany OpenAI run completed and passed validation. DeepSeek
completed six searches but its JSON was cut off by the output-token limit and
is eligible for the configured single continuation page. Kimi K3 reproduced
its `tokenization_failed` error. The subsequent Kimi K2.6 fallback completed one
search round but degenerated into repeated non-JSON output until its token
limit, so it was also rejected. Only redacted aggregate status is committed;
the OpenAI lead records and rejected provider payloads remain local and ignored.

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

Every provider receives the identical substituted prompt as system-level
instructions and the identical country-specific user trigger. The trigger is a
compact, valid initial search task containing country, languages, Cudy, channel
roles, contacts, and JSON intent. This remains useful even when a gateway uses
the user message verbatim as its first native-search query, while keeping the
full benchmark rules out of the query and message roles consistent.

Use `npm run benchmark:preflight -- <provider>` before a measured run. It first
checks a tiny no-search request, proceeds to one native-search request only on
success, performs no automatic retries, classifies gateway/upstream/account
pool failures, and stores the diagnostic report only in the ignored raw folder.

Prompt v1.0 remains preserved as the original baseline. Pilot v1.1 removes
repetition while retaining the same knowledge, evidence, privacy, role, and
output requirements. OpenAI uses Responses API streaming so long-running web
search emits progress events instead of relying on one silent synchronous
connection.
