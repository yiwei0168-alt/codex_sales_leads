import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { runSkillScript } from "../src/lib/assistant/main/sandbox";

// Exercise the standard deployable Node/Python image. Browser dependencies
// remain a separate acceptance gate. Never mount the repository itself.
process.env.AGENT_SANDBOX_IMAGE = "codex-agent-sandbox:1";
const script = `import json, os, socket
from pathlib import Path
input_data=json.loads(Path('/input/task-input.json').read_text())
try:
    Path('/input/escape.txt').write_text('forbidden')
    writable=True
except OSError:
    writable=False
try:
    socket.create_connection(('1.1.1.1',443),timeout=1).close()
    network=True
except OSError:
    network=False
print(json.dumps({'uid':os.getuid(),'input':input_data,'writable':writable,'network':network,'repoMounted':Path('/input/.git').exists(),'dockerSocket':Path('/var/run/docker.sock').exists()}))`;
const result = await runSkillScript({ "scripts/check.py": script }, "scripts/check.py", JSON.stringify({ marker: "public-fixture" }));
assert.equal(result.status, "success", JSON.stringify(result));
const output = JSON.parse(result.stdout.trim());
assert.deepEqual(output, { uid: 65534, input: { marker: "public-fixture" }, writable: false, network: false, repoMounted: false, dockerSocket: false });
const nodeScript = `import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getuid } from 'node:process';
let writable=false;
try { writeFileSync('/input/escape.txt','forbidden'); writable=true; } catch {}
console.log(JSON.stringify({uid:getuid(),input:JSON.parse(readFileSync('/input/task-input.json','utf8')),writable,repoMounted:existsSync('/input/.git'),dockerSocket:existsSync('/var/run/docker.sock')}));`;
const nodeResult = await runSkillScript({ "scripts/check.mjs": nodeScript }, "scripts/check.mjs", JSON.stringify({ marker: "public-node-fixture" }));
assert.equal(nodeResult.status, "success", JSON.stringify(nodeResult));
assert.deepEqual(JSON.parse(nodeResult.stdout.trim()), { uid: 65534, input: { marker: "public-node-fixture" }, writable: false, repoMounted: false, dockerSocket: false });
const before = await readdir("tmp/agent-sandbox");
await assert.rejects(runSkillScript({ "../invalid.py": "print('never')", "scripts/check.py": script }, "scripts/check.py", "{}"), /Invalid or reserved Skill path/);
assert.deepEqual(await readdir("tmp/agent-sandbox"), before, "Malformed package must not leave a task mount behind");
console.log(JSON.stringify({ status: "pass", image: process.env.AGENT_SANDBOX_IMAGE, python: output, node: JSON.parse(nodeResult.stdout.trim()) }));
