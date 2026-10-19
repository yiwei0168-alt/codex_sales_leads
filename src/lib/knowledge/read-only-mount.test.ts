import {expect,it} from 'vitest';
import {descriptorHasReadOnlyMount as check} from './read-only-mount';
const fd='pos:\t0\nflags:\t0100000\nmnt_id:\t42\nino:\t123\n';
const mount='42 1 0:9 / /data ro,nosuid,nodev shared:2 future:tag - ext4 /dev/disk rw\n';
it('accepts descriptor-bound read-only bind mounts even with writable backing superblock',()=>expect(check(mount,fd)).toBe(true));
it('ignores unrelated nested writable mounts and unknown optional fields',()=>expect(check(mount+'43 42 0:10 / /data/nested rw - tmpfs tmpfs rw\n',fd)).toBe(true));
it('uses actual descriptor mount rather than a parent read-only path',()=>expect(check(mount+'43 42 0:10 / /data/nested rw - tmpfs tmpfs rw\n',fd.replace('42','43'))).toBe(false));
it.each([
  mount.replace('ro,nosuid','rw,nosuid'),mount.replace('ro,nosuid','ro,rw'),mount.replace('42 1','41 1'),mount+mount,
  mount.replace(' - ext4',' ext4'),mount.replace(' 0:9 ',' bad '),mount+'extra',
])('rejects writable, missing, ambiguous or malformed mount records: %s',value=>expect(check(value,fd)).toBe(false));
it.each(['','mnt_id: nope\n','mnt_id:\n42\n',fd+fd,fd.replace('42','99')])('rejects missing or ambiguous descriptor mount IDs',value=>expect(check(mount,value)).toBe(false));
