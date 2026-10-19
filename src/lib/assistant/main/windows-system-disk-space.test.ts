import {expect,it,vi} from 'vitest';
import {requireWindowsSystemDiskSpace} from '../../../../scripts/lib/windows-system-disk-space.mjs';

it('rejects a completely exhausted system disk before Docker can be launched',()=>{
 const readSpace=vi.fn().mockReturnValue({bavail:BigInt(0),bsize:BigInt(4096)});
 expect(()=>requireWindowsSystemDiskSpace({platform:'win32',systemDrive:'C:',readSpace})).toThrow(expect.objectContaining({code:'MA24_SYSTEM_DISK_FULL'}));
 expect(readSpace).toHaveBeenCalledExactlyOnceWith('C:/');
});
it('reports exact available bytes without inventing a minimum build-size threshold',()=>{
 const readSpace=vi.fn().mockReturnValue({bavail:BigInt(1),bsize:BigInt(1)});
 expect(requireWindowsSystemDiskSpace({platform:'win32',systemDrive:'C:',readSpace})).toEqual({checked:true,systemDrive:'C:',availableBytes:'1'});
});
it.each(['linux','darwin'] as const)('does not query a Windows disk on %s',platform=>{
 const readSpace=vi.fn();expect(requireWindowsSystemDiskSpace({platform,systemDrive:undefined,readSpace})).toEqual({checked:false});expect(readSpace).not.toHaveBeenCalled();
});
it('rejects an absent or non-volume system-drive value before filesystem access',()=>{
 const readSpace=vi.fn();for(const systemDrive of ['',String.raw`C:\unexpected`,'C:/','unknown'])
  expect(()=>requireWindowsSystemDiskSpace({platform:'win32',systemDrive,readSpace})).toThrow(expect.objectContaining({code:'MA24_SYSTEM_DISK_SPACE_UNAVAILABLE'}));
 expect(readSpace).not.toHaveBeenCalled();
});
it.each([{name:'negative blocks',space:{bavail:BigInt(-1),bsize:BigInt(4096)}},{name:'zero block size',space:{bavail:BigInt(1),bsize:BigInt(0)}},
 {name:'number instead of bigint',space:{bavail:0,bsize:4096}}])('fails explicitly on invalid filesystem metadata: $name',({space})=>{
 expect(()=>requireWindowsSystemDiskSpace({platform:'win32',systemDrive:'C:',readSpace:vi.fn().mockReturnValue(space)})).toThrow(expect.objectContaining({code:'MA24_SYSTEM_DISK_SPACE_UNAVAILABLE'}));
});
it('does not expose raw filesystem errors or silently approve an unreadable disk',()=>{
 const readSpace=vi.fn().mockImplementation(()=>{throw new Error('sensitive filesystem details');});
 expect(()=>requireWindowsSystemDiskSpace({platform:'win32',systemDrive:'C:',readSpace})).toThrow('free space is unavailable');
 expect(()=>requireWindowsSystemDiskSpace({platform:'win32',systemDrive:'C:',readSpace})).not.toThrow('sensitive filesystem details');
});
