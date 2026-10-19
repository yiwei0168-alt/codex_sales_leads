export function requireWindowsSystemDiskSpace(options?:{
 platform?:NodeJS.Platform;
 systemDrive?:string;
 readSpace?:(path:string)=>{bavail:bigint;bsize:bigint};
}):{checked:false}|{checked:true;systemDrive:string;availableBytes:string};
