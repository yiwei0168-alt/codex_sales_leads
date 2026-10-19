import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({query:vi.fn(),open:vi.fn(),realpath:vi.fn(),stat:vi.fn(),fileStat:vi.fn(),read:vi.fn(),close:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:m.query}));
vi.mock('node:fs/promises',()=>({open:m.open,realpath:m.realpath,stat:m.stat}));
import {registerKnowledgeAsset} from './document-repository';
const bytes=Buffer.from('approved original'),hash=createHash('sha256').update(bytes).digest('hex');
const input={documentId:'document',storageKey:'knowledge/fixture.pdf',documentType:'PDF',sourceNature:'synthetic-test',expectedSha256:hash};
const info=()=>({isFile:()=>true,size:bytes.length,dev:1,ino:2,mtimeMs:10,ctimeMs:11});
beforeEach(()=>{
 for(const mock of Object.values(m))mock.mockReset();
 m.realpath.mockResolvedValue(resolve(input.storageKey));m.stat.mockResolvedValue(info());m.fileStat.mockResolvedValue(info());
 m.open.mockResolvedValue({stat:m.fileStat,read:m.read,close:m.close});
 let offset=0;m.read.mockImplementation(async(buffer:Buffer,start:number,length:number)=>{
  const count=Math.min(length,bytes.length-offset);bytes.copy(buffer,start,offset,offset+count);offset+=count;return {bytesRead:count};
 });
 m.query.mockResolvedValue([{id:'asset'}]);
});
it('registers a stable descriptor read with the approved digest and exact byte count',async()=>{
 expect(await registerKnowledgeAsset('owner',input)).toEqual({id:'asset',sha256:hash,byteSize:bytes.length});
 expect(m.query.mock.calls[0][2].slice(0,5)).toEqual(['document',input.storageKey,hash,'application/pdf',bytes.length]);
 expect(m.close).toHaveBeenCalledOnce();
});
it('rejects an escaped resolved path before opening or writing',async()=>{
 m.realpath.mockResolvedValue(resolve('tmp/outside.pdf'));
 await expect(registerKnowledgeAsset('owner',input)).rejects.toThrow('escaped storage root');
 expect(m.open).not.toHaveBeenCalled();expect(m.query).not.toHaveBeenCalled();
});
it('rejects an equal-size mutation observed through descriptor metadata',async()=>{
 m.fileStat.mockResolvedValueOnce(info()).mockResolvedValueOnce({...info(),ctimeMs:12});
 await expect(registerKnowledgeAsset('owner',input)).rejects.toThrow('changed during registration');
 expect(m.query).not.toHaveBeenCalled();expect(m.close).toHaveBeenCalledOnce();
});
it('rejects replacement at the same canonical path even with the same size and times',async()=>{
 m.stat.mockResolvedValue({...info(),ino:3});
 await expect(registerKnowledgeAsset('owner',input)).rejects.toThrow('changed during registration');
 expect(m.query).not.toHaveBeenCalled();expect(m.close).toHaveBeenCalledOnce();
});
it('rejects a path retargeted to another file within the storage root',async()=>{
 m.realpath.mockResolvedValueOnce(resolve(input.storageKey)).mockResolvedValueOnce(resolve('knowledge/other.pdf'));
 await expect(registerKnowledgeAsset('owner',input)).rejects.toThrow('changed during registration');
 expect(m.query).not.toHaveBeenCalled();
});
it('rejects truncation and closes the descriptor without a registration write',async()=>{
 m.read.mockResolvedValue({bytesRead:0});
 await expect(registerKnowledgeAsset('owner',input)).rejects.toThrow('changed during registration');
 expect(m.query).not.toHaveBeenCalled();expect(m.close).toHaveBeenCalledOnce();
});
it('rejects growth beyond the initial file size',async()=>{
 m.fileStat.mockResolvedValue({...info(),size:bytes.length-1});
 await expect(registerKnowledgeAsset('owner',input)).rejects.toThrow('changed during registration');
 expect(m.query).not.toHaveBeenCalled();expect(m.close).toHaveBeenCalledOnce();
});
it('rejects a stable file that differs from the approved digest before writing',async()=>{
 await expect(registerKnowledgeAsset('owner',{...input,expectedSha256:'0'.repeat(64)})).rejects.toThrow('no longer matches approved hash');
 expect(m.query).not.toHaveBeenCalled();expect(m.close).toHaveBeenCalledOnce();
});
it('rejects a malformed approval digest before accessing the filesystem',async()=>{
 await expect(registerKnowledgeAsset('owner',{...input,expectedSha256:'invalid'})).rejects.toThrow('Invalid expected');
 expect(m.open).not.toHaveBeenCalled();expect(m.query).not.toHaveBeenCalled();
});
