# Local UI asset failure, 2026-09-21

The local product at `http://127.0.0.1:3000/` returned HTTP 200 for the login page, but its JavaScript and CSS chunks returned HTTP 500. The browser therefore displayed the form without a working login handler. The synthetic browser check failed before any login request was sent. Two `next start` processes, launched on September 17 and September 20, were listening on port 3000 while the shared `.next` build directory had changed.

Both old product server processes were stopped, `npm run build` completed, and one production server was started on `127.0.0.1:3000`. The authenticated synthetic browser workflow then passed at 1366px and 390px, including login, navigation, refresh, approval cards and task state. The fixture sent no mail and made no paid model calls.

Operational check after a build or restart: run `npm.cmd run ui:check-assets` in Windows PowerShell before opening the product. This checks the static asset references in the served home page and fails on missing or broken chunks. Run `node scripts/run-tsx.cjs scripts/verify-main-agent-ui.ts` for the authenticated desktop and mobile workflow. The latter now reports browser resource and script errors if login JavaScript does not execute.

Do not rebuild the shared `.next` directory while an old `next start` process is serving it. Stop the old local server, build, start one server, then run the two checks above. This incident establishes the local failure cause and recovery; it does not establish the cause of every future page error.
