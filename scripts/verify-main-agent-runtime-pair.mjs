import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const [web,runtime]=process.argv.slice(2);
assert(process.argv.length===4&&[web,runtime].every(value=>value&&/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(value)),'Expected Web and main runtime images');
// Reuse the exact source/Node inspector, while keeping the runtime role distinct
// from a collector declaration or any production enrollment claim.
const inspected=JSON.parse(execFileSync(process.execPath,['scripts/verify-skill-runtime-pair.mjs',web,runtime],{encoding:'utf8',maxBuffer:2*1024*1024}));
assert.equal(inspected.skillSourceRuntimePair,'passed');
console.log(JSON.stringify({mainAgentRuntimePair:'passed',web,runtime,sourceCommit:inspected.sourceCommit,
 webImageId:inspected.webImageId,mainRuntimeImageId:inspected.collectorImageId,
 inspectionUsesImmutableImageIds:inspected.inspectionUsesImmutableImageIds,runtimeHash:inspected.runtimeHash,sourceInputs:inspected.sourceInputs,
 node:inspected.node,nodeSha256:inspected.nodeSha256,platform:inspected.platform,arch:inspected.arch,
 webPackages:inspected.webPackages,mainRuntimePackages:inspected.collectorPackages,webUnresolved:inspected.webUnresolved,mainRuntimeUnresolved:inspected.collectorUnresolved,
 completeDependencyRuntimeEquivalenceVerified:false,productionQualified:false,actualModelCalls:0}));
