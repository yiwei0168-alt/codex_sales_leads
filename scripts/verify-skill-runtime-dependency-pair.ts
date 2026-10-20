import assert from 'node:assert/strict';
import {inspectSkillRuntimePackage} from './lib/skill-runtime-package-inspection';
import {compareInspectedSkillRuntimeBytes} from '../src/lib/assistant/main/skill-runtime-package-pair';

const [main,collector]=process.argv.slice(2);
assert(process.argv.length===4&&[main,collector].every(value=>/^sha256:[a-f0-9]{64}$/.test(value??'')),'Expected two immutable image IDs');
const mainInspection=inspectSkillRuntimePackage(main,'main-agent'),collectorInspection=inspectSkillRuntimePackage(collector,'skill-collector');
const compared=compareInspectedSkillRuntimeBytes([{purpose:'task-model-transport',inspection:mainInspection},
 ...['model-transport','runner-declaration'].map(purpose=>({purpose,inspection:collectorInspection}))]);
assert.equal(compared.runtimePackageBytesPairRevalidated,true,compared.runtimePackageBytesPairBlockers.join(', '));
console.log(JSON.stringify({localRuntimeDependencyPair:'passed',mainInspection,collectorInspection,comparison:compared,
 runtimeRegistrationsPublished:false,completeDependencyRuntimeEquivalenceVerified:false,productionQualified:false,automaticActivation:false,modelCalls:0}));
