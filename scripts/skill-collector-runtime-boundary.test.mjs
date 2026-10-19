import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyCollectorRuntimeBoundary as check} from './skill-collector-package.mjs';
const status='Uid:\t1000\t1000\t1000\t1000\nNoNewPrivs:\t1\n'+['CapInh','CapPrm','CapEff','CapBnd','CapAmb'].map(name=>name+':\t0000000000000000\n').join('');
const mountInfo='1 0 0:1 / / ro - overlay overlay rw\n2 1 0:2 / /proc rw,nosuid - proc proc rw\n';
const base={platform:'linux',uid:1000,status,mountInfo,root:'/app',executable:'/usr/local/bin/node'};
test('permits an unprivileged read-only process without treating a writable superblock as its mount mode',()=>assert.equal(check(base).runtimeBoundaryVerified,true));
for(const [label,change] of [
 ['root',{uid:0}],['unsupported',{platform:'win32'}],['new privileges',{status:status.replace('NoNewPrivs:\t1','NoNewPrivs:\t0')}],
 ['root effective identity',{status:status.replace('1000\t1000\t1000\t1000','1000\t0\t1000\t1000')}],
 ['writable root',{mountInfo:mountInfo.replace('/ / ro','/ / rw')}],
 ['writable root with isolated read-only package and Node',{mountInfo:mountInfo.replace('/ / ro','/ / rw')+'3 1 0:3 / /app ro - ext4 device rw\n4 1 0:4 / /usr/local/bin/node ro - ext4 device rw\n'}],
 ['writable package submount',{mountInfo:mountInfo+'3 1 0:3 / /app/nested rw - tmpfs tmpfs rw\n'}],
 ['writable node mount',{mountInfo:mountInfo+'3 1 0:3 / /usr/local/bin/node rw - ext4 device rw\n'}],
 ['escaped writable submount',{mountInfo:mountInfo+'3 1 0:3 / /app/with\\040space rw - tmpfs tmpfs rw\n'}],
 ['duplicate protected mount',{mountInfo:mountInfo+'3 1 0:3 / /app ro - tmpfs tmpfs ro\n4 1 0:3 / /app ro - tmpfs tmpfs ro\n'}],
 ['invalid mount',{mountInfo:'not mount information'}],['missing status',{status:''}],['duplicate status',{status:status+'NoNewPrivs:\t1\n'}],
])test(`rejects ${label}`,()=>assert.throws(()=>check({...base,...change})));
for(const name of ['CapInh','CapPrm','CapEff','CapBnd','CapAmb'])test(`rejects nonempty ${name}`,()=>assert.throws(()=>check({...base,status:status.replace(name+':\t0000000000000000',name+':\t0000000000000001')})));
