/** Read-only check that the current G16 runner cannot claim or call a model. */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  return next(specifier, context);
} });

const { assertMa24EvaluationModelReady } = await import(
  '../src/lib/knowledge/evaluation/ma24-evaluation-runner');
let denied = false;
try { assertMa24EvaluationModelReady(); }
catch (error) {
  assert(error instanceof Error && error.message.startsWith('MA24 evaluation model admission unavailable:'));
  denied = true;
}
assert(denied, 'Current unready G15 preview unexpectedly admitted a paid model run');
console.log(JSON.stringify({ schema: 'ma24-g16-runner-preclaim-local-v1',
  paidAdmissionDenied: true, taskClaimed: false, providerCalls: 0 }));
