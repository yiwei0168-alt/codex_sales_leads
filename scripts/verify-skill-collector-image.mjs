import assert from 'node:assert/strict';
import {spawnSync,execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const [image]=process.argv.slice(2);
assert(process.argv.length===3&&image&&/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(image),'Expected one collector image');
const config=JSON.parse(execFileSync('docker',['image','inspect',image],{encoding:'utf8'}))[0];
assert.equal(config.Config.User,'node');assert.deepEqual(config.Config.Entrypoint,['node','/app/start.mjs']);
const temporary=mkdtempSync(join(tmpdir(),'collector-image-tamper-'));
const run=(extra,args)=>spawnSync('docker',['run','--rm','--read-only','--network','none','--cap-drop=ALL',
 '--security-opt=no-new-privileges',...extra,image,...args],{encoding:'utf8',maxBuffer:2*1024*1024});
try{
 const verified=run([],['--verify']);assert.equal(verified.status,0,verified.stderr);
 const receipt=JSON.parse(verified.stdout.trim());assert.equal(receipt.collectorPackageIntegrity,'passed');
 assert.match(receipt.deploymentHash,/^[a-f0-9]{64}$/);assert.equal(receipt.deploymentEnrollmentVerified,false);
 const enrolled=run(['--env',`SKILL_RUNNER_DEPLOYMENT_SHA256=${receipt.deploymentHash}`],['--verify']);
 assert.equal(enrolled.status,0,enrolled.stderr);assert.equal(JSON.parse(enrolled.stdout.trim()).deploymentEnrollmentVerified,true);
 for(const hash of [undefined,'invalid','0'.repeat(64)]){
  const denied=run(hash===undefined?[]:['--env',`SKILL_RUNNER_DEPLOYMENT_SHA256=${hash}`],['--check','/missing-private-job.json']);
  assert.equal(denied.status,1);assert(denied.stderr.includes('Collector package integrity verification failed'));
  assert(!denied.stderr.includes('Skill collector failed'),'Enrollment must reject before the runner reads a job');
 }
 const admitted=run(['--env',`SKILL_RUNNER_DEPLOYMENT_SHA256=${receipt.deploymentHash}`],['--check','/missing-private-job.json']);
 assert.equal(admitted.status,1);assert(admitted.stderr.includes('Skill collector failed'));
 assert(!admitted.stderr.includes('Collector package integrity verification failed'),'Measured enrollment must reach the runner');
 const injected=run(['--env','NODE_OPTIONS=--no-warnings'],['--verify']);
 assert.equal(injected.status,1);assert(injected.stderr.includes('Collector package integrity verification failed'));
 const help=run([],['--help']);assert.equal(help.status,0,help.stderr);assert(help.stdout.includes('--check|--execute'));
 const fake=join(temporary,'runner.cjs');writeFileSync(fake,"throw new Error('tampered code must not execute');");
 const tampered=run(['--mount',`type=bind,source=${fake},target=/app/runner.cjs,readonly`],['--help']);
 assert.equal(tampered.status,1);assert(tampered.stderr.includes('Collector package integrity verification failed'));
 assert(!tampered.stderr.includes('tampered code must not execute'));
 console.log(JSON.stringify({collectorImageVerification:'passed',image,imageId:config.Id,commit:config.Config.Labels['org.opencontainers.image.revision'],
  packageFiles:receipt.files,deploymentHash:receipt.deploymentHash,measuredEnrollmentVerified:true,
  missingMalformedAndMismatchedEnrollmentRejectedBeforeRunner:true,matchedEnrollmentReachesRunner:true,nodeOptionsRejected:true,
  nonRootReadOnlyNoNetwork:true,changedRunnerRejectedBeforeExecution:true,actualModelCalls:0,productionQualified:false}));
}finally{rmSync(temporary,{recursive:true,force:true});}
