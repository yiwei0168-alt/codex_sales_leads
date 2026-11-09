import { newAsyncContext } from 'quickjs-emscripten';
import { HybridStop } from './hybrid-workflows';

/** Fresh WASM heap per invocation. Only JSON bridges; no host objects, imports or I/O. */
export async function interpretReadProgram(code: string,
  bridge: (kind: 'call' | 'workflow', payload: string) => Promise<string>,
  limits = { memoryBytes: 16 * 1024 * 1024, activeMs: 2000, wallMs: 60000 },
  extended?: (kind: 'parallel' | 'handoff', payload: string) => Promise<string>) {
  const vm = await newAsyncContext();
  const started = Date.now();
  let ioMs = 0;
  let failure: unknown;
  vm.runtime.setMemoryLimit(limits.memoryBytes);
  vm.runtime.setMaxStackSize(512 * 1024);
  vm.runtime.setInterruptHandler(() => Date.now() - started > limits.wallMs || Date.now() - started - ioMs > limits.activeMs);
  try {
    for (const kind of ['call', 'workflow', ...(extended ? ['parallel', 'handoff'] as const : [])] as const) {
      const handle = vm.newAsyncifiedFunction(`_${kind}`, async payload => {
        if (failure) return {error:vm.newError('Execution stopped')};
        const before = Date.now();
        try {
          if (before - started > limits.wallMs) throw new HybridStop('Interpreter time limit reached.');
          const text = vm.getString(payload);
          if (text.length > 32000) throw new HybridStop('Tool input exceeds the interpreter limit.');
          return vm.newString(await (kind === 'parallel' || kind === 'handoff' ? extended!(kind, text) : bridge(kind, text)));
        } catch (error) {
          failure = error;
          return {error:vm.newError('Tool execution stopped; use the saved server receipts.')};
        } finally { ioMs += Date.now() - before; }
      });
      vm.setProp(vm.global, `_${kind}`, handle);
      handle.dispose();
    }
    // Capture the native JSON bridge in a closure. Guests cannot get host references.
    const setup = vm.evalCode(`(() => {
      const call = _call, workflow = _workflow, parse = JSON.parse, stringify = JSON.stringify;
      const parallel = globalThis._parallel, handoff = globalThis._handoff;
      globalThis.tools = Object.freeze({
        call: (tool, args) => parse(call(stringify({tool, arguments: args}))),
        workflow: (args) => parse(workflow(stringify(args))),
        ...(parallel ? {
          parallel: (requests) => parse(parallel(stringify(requests))),
          handoff: (reason, value = null) => parse(handoff(stringify({reason, value})))
        } : {})
      });
      delete globalThis._call; delete globalThis._workflow;
      delete globalThis._parallel; delete globalThis._handoff;
      globalThis.Date = undefined; Math.random = () => { throw Error('Randomness unavailable'); };
    })()`);
    vm.unwrapResult(setup).dispose();
    // Synchronous guest JS; Asyncify suspends host I/O. No Promise jobs or module loader.
    const evaluated = await vm.evalCodeAsync(`((stringify) => {
      const value = (() => { "use strict";\n${code}\n})();
      if(value && typeof value.then === 'function') throw Error('Return synchronous JSON, not a promise');
      return stringify(value);
    })(JSON.stringify)`, 'read-program.js');
    if (failure) { evaluated.dispose(); throw failure; }
    if (evaluated.error) { evaluated.dispose(); throw new HybridStop('Program syntax, runtime or resource limit failure; reuse saved reads and continue dynamically.'); }
    try {
      const text = vm.getString(evaluated.value);
      if (text.length > 60000) throw new HybridStop('Program output exceeds 60000 characters; narrow the projection.');
      if (!text) throw new HybridStop('Program must return a JSON value.');
      return JSON.parse(text) as unknown;
    } finally { evaluated.dispose(); }
  } finally { vm.dispose(); }
}
