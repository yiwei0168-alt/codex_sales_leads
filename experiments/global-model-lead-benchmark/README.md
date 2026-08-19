# Global Model Lead Benchmark

This experiment compares high-performance models from different providers on
their ability to discover Cudy Technology channel prospects across regions.

The benchmark permits only each model provider's native web-search or grounding
capability. External crawlers, browser automation, Tavily, third-party search
APIs, contact databases, and the project's existing lead data are excluded.

## Current stage

Country selection and the universal benchmark prompt are frozen. The next stage
is provider model discovery and native-search capability verification; no
country benchmark run has started.

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
