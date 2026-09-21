# Project Working Agreement

- Record every explicit user-confirmed product rule in `docs/CONFIRMED_PRODUCT_RULES.md` with a stable ID, exact values, scope, and implementation/acceptance status. Update linked PRD/workflow documentation in the same stage; never treat confirmation as implementation or test evidence. Preserve superseded decisions in version history and do not invent details for historical confirmations whose proposals are unavailable.

- Preserve project progress with focused Git commits after each meaningful, verified development stage.
- Push completed commits to `origin/main` so files, code, and progress remain synchronized with GitHub.
- Never commit secrets, credentials, local environment files, or generated dependency directories.
- Before committing, inspect the diff and run the most relevant available checks.
- From MA13 onward, prioritize completing product workflows and improving result quality. Do not maintain a development cost/efficiency ledger, calculate stage efficiency metrics, or automatically generate expense reports.
- Preserve historical ledgers and raw provider receipts needed for task recovery, duplicate-effect prevention, and explicit user-requested reconciliation. Produce cost analysis only when the user explicitly requests it.
- Continue updating the relevant product rule, PRD, workflow, and acceptance evidence for verified behavior changes; the historical efficiency ledger is no longer a required stage artifact.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
