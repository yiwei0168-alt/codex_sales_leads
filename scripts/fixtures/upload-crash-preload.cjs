/* eslint-disable @typescript-eslint/no-require-imports -- Test-only preload, never loaded by production. */
const {writeFileSync} = require('node:fs');
const {resolve, sep} = require('node:path');
const cp = require('node:child_process');
const {Client} = require('pg');
const db = new URL(process.env.DATABASE_URL);
const marker = resolve(process.env.UPLOAD_CRASH_MARKER);
if (!['localhost','127.0.0.1','::1'].includes(db.hostname) || !/^\/ma11_replay_[a-f0-9]{12}$/.test(db.pathname)
 || !marker.startsWith(resolve('tmp/upload-crash') + sep) || !process.argv.some(arg => /^--job-id=[a-f0-9-]{36}$/.test(arg))) throw new Error('Isolated clone and exact job required');
const phase = process.env.UPLOAD_CRASH_PHASE;
function checkpoint() {
  writeFileSync(marker, JSON.stringify({pid: process.pid, phase}), {flag:'wx'});
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120_000);
  throw new Error('Parent did not terminate worker');
}
const spawn = cp.spawn;
cp.spawn = function(command,args,options) {
  if (phase === 'extracting' && args?.[0] === 'scripts/extract-uploaded-knowledge.py') checkpoint();
  return spawn.call(this, command,args,options);
};
require('node:module').syncBuiltinESMExports();
const query = Client.prototype.query, stages = new WeakMap();
Client.prototype.query = function(sql,...args) {
  const text = typeof sql === 'string' ? sql : sql?.text || '';
  if (phase === 'extracted' && /update knowledge_upload_job set status='extracted'/.test(text)) stages.set(this,'extracted');
  if (phase === 'registered' && /update knowledge_upload_job set status='registered'/.test(text)) stages.set(this,'registered');
  if (phase === 'tree-transaction' && /update knowledge_document set current_tree_version_id/.test(text)) stages.set(this,'tree-transaction');
  if (['review-before-commit','review-after-commit'].includes(phase) && /insert into knowledge_upload_review_completion/.test(text)) stages.set(this,phase);
  const stage = stages.get(this), commit = /^commit$/i.test(text.trim());
  if (commit && ['tree-transaction','review-before-commit'].includes(phase) && stage === phase) checkpoint();
  const result = query.call(this,sql,...args);
  if (commit) {stages.delete(this); if (stage === phase) return result.then(value => {checkpoint(); return value;});}
  return result;
};
