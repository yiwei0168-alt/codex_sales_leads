import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {requireWindowsSystemDiskSpace} from './lib/windows-system-disk-space.mjs';
if(process.argv.length!==2)throw new Error('No image build arguments accepted');
requireWindowsSystemDiskSpace();
const root=resolve('.next-releases');mkdirSync(root,{recursive:true});
const commit=execFileSync('git',['rev-parse','--verify','HEAD^{commit}'],{encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('Fixed commit required');
const temporary=mkdtempSync(join(root,'main-agent-runtime-')),within=relative(root,temporary);
if(!within||within.startsWith('..')||isAbsolute(within))throw new Error('Build directory escaped release root');
const image=`ma24-main-agent-runtime:${commit.slice(0,8)}`;
try{
 const archive=join(temporary,'source.tar'),context=join(temporary,'context');mkdirSync(context);
 execFileSync('git',['archive','--format=tar',commit,'-o',archive]);execFileSync('tar',['-xf',archive,'-C',context]);
 execFileSync('docker',['build','--file',join(context,'Dockerfile.main-agent-runtime'),'--build-arg',`SOURCE_COMMIT=${commit}`,'--tag',image,context],{stdio:'inherit'});
 console.log(JSON.stringify({mainAgentRuntimeImageBuild:'passed',commit,image,productionQualified:false}));
}finally{rmSync(temporary,{recursive:true,force:true});}
