import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {verifySkillRunnerAttestation,verifyConfiguredSkillRunnerAttestation} from './skill-runner-attestation';

const pair=generateKeyPairSync('ed25519'),other=generateKeyPairSync('ed25519');
const hash=(value:string)=>digest(value);
const expected={ownerId:'11111111-1111-4111-8111-111111111111',freezeId:'22222222-2222-4222-8222-222222222222',
 planHash:hash('plan'),artifactHash:hash('artifact'),runtimeIdentityHash:hash('runtime'),deploymentHash:hash('deployment'),
 collectorId:'dedicated-collector',frozenAt:'2026-10-16T00:00:00.000Z',expiresAt:'2026-10-17T00:00:00.000Z',
 capturedAt:'2026-10-16T00:01:00.000Z',completedAt:'2026-10-16T00:02:00.000Z'};
const registry=()=>({protocol:'skill-runner-trust-registry-v1',keys:[{keyId:'runner-1',collectorId:expected.collectorId,
 deploymentHash:expected.deploymentHash,publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),
 enabled:true,notBefore:'2026-10-15T00:00:00.000Z',expiresAt:expected.expiresAt}]});
const statement=()=>({protocol:'skill-runner-attestation-v1',keyId:'runner-1',
 ownerId:expected.ownerId,freezeId:expected.freezeId,planHash:expected.planHash,artifactHash:expected.artifactHash,
 runtimeIdentityHash:expected.runtimeIdentityHash,deploymentHash:expected.deploymentHash,collectorId:expected.collectorId,
 capturedAt:'2026-10-16T00:01:00.000Z',completedAt:'2026-10-16T00:02:00.000Z',
 issuedAt:'2026-10-16T00:03:00.000Z',expiresAt:'2026-10-16T02:00:00.000Z'});
const envelope=(value=statement(),key=pair.privateKey)=>({statement:value,
 signature:sign(null,Buffer.from(digest(value),'hex'),key).toString('base64url')});
const now=new Date('2026-10-16T01:00:00.000Z');
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
it('authenticates a bound collector statement without granting activation',()=>{
 expect(verifySkillRunnerAttestation(envelope(),registry(),expected,now)).toMatchObject({
  signatureVerified:true,bindingsVerified:true,automaticActivation:false});
});
it.each(['ownerId','freezeId','planHash','artifactHash','runtimeIdentityHash','deploymentHash','collectorId'] as const)
 ('rejects a correctly signed statement for a different %s',field=>{
  const changed={...expected,[field]:['ownerId','freezeId'].includes(field)?'33333333-3333-4333-8333-333333333333':hash('different')};
  expect(()=>verifySkillRunnerAttestation(envelope(),registry(),changed,now)).toThrow('binding');
 });
it('rejects tampering and a signature made by an unenrolled private key',()=>{
 const signed=envelope();signed.statement.artifactHash=hash('tampered');
 expect(()=>verifySkillRunnerAttestation(signed,registry(),{...expected,artifactHash:hash('tampered')},now)).toThrow('signature');
 expect(()=>verifySkillRunnerAttestation(envelope(statement(),other.privateKey),registry(),expected,now)).toThrow('signature');
});
it.each(['capturedAt','completedAt'] as const)('rejects validly signed but observation-unbound %s',field=>{
 expect(()=>verifySkillRunnerAttestation(envelope({...statement(),[field]:'2026-10-16T00:01:30.000Z'}),registry(),expected,now)).toThrow('observation time binding');
});
it('rejects removed, disabled, duplicated or differently enrolled trust keys',()=>{
 const removed=registry();removed.keys=[];
 expect(()=>verifySkillRunnerAttestation(envelope(),removed,expected,now)).toThrow();
 for(const change of [{enabled:false},{collectorId:'different'},{deploymentHash:hash('different')}]){
  const r=registry();Object.assign(r.keys[0],change);expect(()=>verifySkillRunnerAttestation(envelope(),r,expected,now)).toThrow();
 }
 const duplicate=registry();duplicate.keys.push(duplicate.keys[0]);
 expect(()=>verifySkillRunnerAttestation(envelope(),duplicate,expected,now)).toThrow();
});
it.each([
 {capturedAt:'2026-10-15T23:59:00.000Z'}, {completedAt:'2026-10-16T00:00:00.000Z'},
 {issuedAt:'2026-10-16T02:00:00.000Z'}, {expiresAt:'2026-10-16T01:00:00.000Z'},
 {expiresAt:'2026-10-18T00:00:00.000Z'},
])('rejects time-window drift %j',change=>{
 expect(()=>verifySkillRunnerAttestation(envelope({...statement(),...change}),registry(),expected,now)).toThrow('time window');
});
it('rejects expired or not-yet-enrolled keys, invalid clocks and private key registry input',()=>{
 for(const change of [{expiresAt:'2026-10-16T00:30:00.000Z'},{notBefore:'2026-10-16T00:01:00.000Z'},
  {publicKeyPem:pair.privateKey.export({type:'pkcs8',format:'pem'}).toString()}]){
  const r=registry();Object.assign(r.keys[0],change);expect(()=>verifySkillRunnerAttestation(envelope(),r,expected,now)).toThrow();
 }
 expect(()=>verifySkillRunnerAttestation(envelope(),registry(),expected,new Date('invalid'))).toThrow('clock');
});
it('requires server registry configuration instead of accepting caller self-certification',async()=>{
 vi.stubEnv('SKILL_RUNNER_TRUST_REGISTRY_FILE','');
 await expect(verifyConfiguredSkillRunnerAttestation(envelope(),expected)).rejects.toThrow('not configured');
});
it('reloads the configured public registry so disabled keys reject the next check',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'skill-runner-public-registry-'));
 try{
  const path=join(directory,'registry.json');
  vi.stubEnv('SKILL_RUNNER_TRUST_REGISTRY_FILE',path);vi.useFakeTimers();vi.setSystemTime(now);
  const enrolled=registry();await writeFile(path,JSON.stringify(enrolled));
  expect((await verifyConfiguredSkillRunnerAttestation(envelope(),expected)).signatureVerified).toBe(true);
  enrolled.keys[0].enabled=false;await writeFile(path,JSON.stringify(enrolled));
  await expect(verifyConfiguredSkillRunnerAttestation(envelope(),expected)).rejects.toThrow('unavailable');
 }finally{await rm(directory,{recursive:true,force:true});}
});
