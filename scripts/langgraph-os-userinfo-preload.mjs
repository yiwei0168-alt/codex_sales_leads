import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const os = require("node:os");

// Studio may inspect the local graph without uploading execution traces.
// An explicit user setting still wins when cloud tracing is intentionally enabled.
process.env.LANGSMITH_TRACING ??= "false";

// libuv can deny passwd lookup in restricted Windows shells. The runtime's
// TypeScript loader only needs a stable local cache suffix, so preserve the normal value
// and provide the process username solely when that lookup is unavailable.
try {
  os.userInfo();
} catch {
  const username = process.env.USERNAME || process.env.USER || "local-user";
  os.userInfo = () => ({
    username,
    uid: -1,
    gid: -1,
    shell: null,
    homedir: process.env.USERPROFILE || os.tmpdir(),
  });
}
