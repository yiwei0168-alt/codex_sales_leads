# Global Model Lead Benchmark

This experiment compares high-performance models from different providers on
their ability to discover Cudy Technology channel prospects across regions.

The benchmark permits only each model provider's native web-search or grounding
capability. External crawlers, browser automation, Tavily, third-party search
APIs, contact databases, and the project's existing lead data are excluded.

## Current stage

Country selection and prompt v1.1 are frozen. Claude is temporarily skipped by
user decision. Kimi K2.6 is the current model after passing basic, native-search,
and JSON Mode checks; Kimi K3 remains recorded as incompatible after reproducing
its tokenization failure. DeepSeek retains its verified latency risk, and OpenAI
uses Responses streaming through Lingyu.

Grok is wired into the same pilot through xAI's Responses API using the
publicly documented `grok-4.5` flagship, server-side Web Search only, high
reasoning effort, JSON Object output, and the same frozen prompt. The account's
model list also exposes `grok-4.6`, but it is not selected because public
capability documentation was unavailable at integration time. Direct Node
networking timed out, so benchmark and preflight commands explicitly enable the
configured environment proxy.

On 2026-08-20, the Germany OpenAI run completed and passed validation. DeepSeek
completed six searches but its first JSON was cut off by the output-token limit;
its single allowed continuation then produced a compact full replacement JSON
without any new search and passed validation. Kimi K3 reproduced its
`tokenization_failed` error. The subsequent Kimi K2.6 fallback completed one
search round but degenerated into repeated non-JSON output until its token
limit, so it was rejected. A later minimal Kimi K2.6 JSON Mode test passed with
thinking and search disabled, isolating the benchmark failure to the combined
native-search continuation and long-form synthesis path rather than basic JSON
support. Enabling JSON Mode on the same frozen benchmark request then produced a
valid Kimi K2.6 result, but it stopped after one of eight allowed searches and
returned only one company, so it is explicitly classified as low recall. Its
reported `tool_budget` stop reason is also inconsistent with the configured
eight-search limit. Only redacted aggregate status is committed; lead records
and rejected provider payloads remain local and ignored.

The first Grok search preflight exposed citation text outside the JSON object;
disabling inline citations resolved that format issue. The second preflight
completed its basic request but the model chose not to invoke Web Search. The
third preflight passed after setting `tool_choice=required` and disabling
parallel calls: exactly one Web Search call was observed and the single output
text block parsed as JSON. The subsequently authorized measured Germany run did
not reproduce that path: with the full prompt plus JSON mode, Grok serialized a
proposed Web Search request as ordinary text instead of invoking the server-side
tool. The API reported zero searches and zero sources, so the response was
rejected and is not eligible for comparison. No retry or continuation was run.
A two-stage native-search then structured-synthesis remediation using
`previous_response_id` is documented but awaits separate user approval.

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
configures OpenAI, Kimi K2.6, DeepSeek, and Grok independently with the frozen
prompt; Claude is temporarily skipped. Each provider is limited to 8
native-search requests, 10,000 visible output tokens, one continuation page,
and 30 minutes. Failed requests are recorded without automatic retry.

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

Use `npm run benchmark:continue:deepseek` only for the configured single
DeepSeek continuation after a `max_tokens` rejection. It replays the original
provider response as conversation history, requests a compact full replacement,
provides no search tool, and verifies page index and unchanged total search
count. Use `npm run benchmark:preflight:kimi-json` for the minimal no-search
Kimi JSON Mode compatibility check; it is not a benchmark run.

Prompt v1.0 remains preserved as the original baseline. Pilot v1.1 removes
repetition while retaining the same knowledge, evidence, privacy, role, and
output requirements. OpenAI uses Responses API streaming so long-running web
search emits progress events instead of relying on one silent synchronous
connection.
