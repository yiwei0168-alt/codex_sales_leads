# Private knowledge and tenant RLS recheck — stage 181 (2026-09-14)

The current product SQL isolation verifier passed with two disabled, randomly generated users. Six synthetic outreach memories tested user, country, role, status and usage-scope filtering; five synthetic RAG documents tested private-owner, shared, market and archived visibility. Mailbox candidate review additionally tested cross-user denial, lock contention, interrupted approval recovery and concurrent idempotency. The verifier removed its fixtures after the checks. It made zero embedding or paid-provider calls and did not use customer content.

The separate read-only tenant audit inspected 79 public tables. The application role had **zero** owner-keyed readable tables without RLS under the audit's key-column filter. Its three contact-link mismatch counts and quarantined-email count were zero. This is a current database observation; the migration role used for inspection is a superuser and is not the application role.

Commands and outputs:

- `node scripts/run-tsx.cjs scripts/verify-private-knowledge-isolation.ts` → `privateKnowledgeIsolation=passed`, two owners, six fixture memories, five fixture documents, two mailbox candidates, `realEmbeddingCalls=0`, `paidCalls=0`, followed by fixture cleanup.
- `node scripts/run-tsx.cjs scripts/audit-tenant-rls.ts` → 79 public tables, `unprotectedOwnerKeyedTables=0`, all four contact-link/quarantine counters zero; audit latency 31 ms.

These checks support A13's tested private-knowledge and tenant boundaries. They do not exercise every private HTTP route, generate a real RAG answer, prove real user adoption or complete A11's natural-language-to-qualified-company chain. Both verifiers used local SQL only; model tokens, paid API credits, cash and retries were zero. The first verifier ran in about three seconds and the audit in about one second. A future optimization is to retain these isolated fixtures as a targeted regression while connecting actual business output and user-adoption records only when the paid whole-run gate is satisfied.
