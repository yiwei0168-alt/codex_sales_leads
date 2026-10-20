import assert from 'node:assert/strict';
import {inspectSkillRuntimePackage} from './lib/skill-runtime-package-inspection';
import {compareInspectedSkillRuntimeBytes} from '../src/lib/assistant/main/skill-runtime-package-pair';

const [main,collector,...options]=process.argv.slice(2),requireEsm=options.length===1&&options[0]==='--esm';
assert((options.length===0||requireEsm)&&[main,collector].every(value=>/^sha256:[a-f0-9]{64}$/.test(value??'')),'Expected two immutable image IDs and optional --esm');
const mainInspection=inspectSkillRuntimePackage(main,'main-agent'),collectorInspection=inspectSkillRuntimePackage(collector,'skill-collector');
const compared=compareInspectedSkillRuntimeBytes([{purpose:'task-model-transport',inspection:mainInspection},
 ...['model-transport','runner-declaration'].map(purpose=>({purpose,inspection:collectorInspection}))]);
assert.equal(compared.runtimePackageBytesPairRevalidated,true,compared.runtimePackageBytesPairBlockers.join(', '));
if(requireEsm)assert.equal(compared.runtimeModuleFormatPairRevalidated,true,compared.runtimeModuleFormatPairBlockers.join(', '));
console.log(JSON.stringify({localRuntimeDependencyPair:'passed',mainInspection,collectorInspection,comparison:compared,
 esmModuleFormatPairVerified:requireEsm,
 runtimeRegistrationsPublished:false,completeDependencyRuntimeEquivalenceVerified:false,productionQualified:false,automaticActivation:false,modelCalls:0}));
