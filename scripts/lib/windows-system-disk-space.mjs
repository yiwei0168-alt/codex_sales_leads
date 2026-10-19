import {statfsSync} from 'node:fs';

/** Host-side admission for the observed Windows system-disk exhaustion case.
 * This is not an estimate of the space a Docker build will need, and does not
 * inspect, prune or move Docker data. Non-Windows hosts are unaffected. */
export function requireWindowsSystemDiskSpace({platform=process.platform,systemDrive=process.env.SystemDrive,
 readSpace=path=>statfsSync(path,{bigint:true})}={}){
 if(platform!=='win32')return {checked:false};
 const unavailable=()=>Object.assign(new Error('Windows system-disk free space is unavailable; no Docker build was started.'),{code:'MA24_SYSTEM_DISK_SPACE_UNAVAILABLE'});
 if(typeof systemDrive!=='string'||!/^[a-z]:$/i.test(systemDrive))throw unavailable();
 let space;try{space=readSpace(`${systemDrive}/`);}catch{throw unavailable();}
 if(typeof space?.bavail!=='bigint'||typeof space.bsize!=='bigint'||space.bavail<0n||space.bsize<=0n)throw unavailable();
 const availableBytes=space.bavail*space.bsize;
 if(availableBytes===0n)throw Object.assign(new Error(`Windows system disk ${systemDrive} has no free space. Restore free space before retrying; no Docker build was started.`),{code:'MA24_SYSTEM_DISK_FULL'});
 return {checked:true,systemDrive,availableBytes:availableBytes.toString()};
}
