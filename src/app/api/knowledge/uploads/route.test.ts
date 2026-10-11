import { beforeEach,describe,expect,it,vi } from "vitest";

const mocks=vi.hoisted(()=>({session:vi.fn(),create:vi.fn(),list:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireApiSession:mocks.session}));
vi.mock("@/lib/knowledge/upload",async importOriginal=>{
  const actual=await importOriginal<typeof import("@/lib/knowledge/upload")>();
  return {...actual,createKnowledgeUploadJob:mocks.create,listKnowledgeUploadJobs:mocks.list};
});
import { GET,POST } from "./route";
import {KnowledgeUploadConflictError} from '@/lib/knowledge/upload';

describe("binary knowledge upload route",()=>{
  beforeEach(()=>{vi.clearAllMocks();process.env.KNOWLEDGE_ADMIN_TOKEN="test-token";
    mocks.session.mockResolvedValue({userId:"00000000-0000-4000-8000-000000000001",displayName:"Owner",role:"admin"});
    mocks.list.mockResolvedValue([]);mocks.create.mockResolvedValue({id:"job",status:"pending",documentType:"PDF",byteSize:12,sourceSha256:"a".repeat(64)});});
  it("lists only through the authenticated repository scope",async()=>{
    const response=await GET();expect(response.status).toBe(200);expect(mocks.list).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001",0,30);
  });
  it('validates pagination and preserves the account scope',async()=>{
    expect((await GET(new Request('http://local/api/knowledge/uploads?offset=-1'))).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
    await GET(new Request('http://local/api/knowledge/uploads?offset=6&limit=7'));
    expect(mocks.list).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001',6,7);
  });
  it('reports a version conflict without pretending the revision was queued',async()=>{
    mocks.create.mockRejectedValue(new KnowledgeUploadConflictError('Document version changed'));
    const form=new FormData();form.set('collection','industry');form.set('title','Revision');form.set('file',new File(['%PDF-1.7'],'r.pdf',{type:'application/pdf'}));
    const response=await POST(new Request('http://local/api/knowledge/uploads',{method:'POST',body:form}));
    expect(response.status).toBe(409);expect((await response.json()).error).toContain('本次未覆盖');
  });
  it('returns the existing job without claiming another queued upload',async()=>{
    mocks.create.mockResolvedValue({id:'existing',status:'registered',reused:true});
    const form=new FormData();form.set('collection','industry');form.set('title','Renamed upload');
    form.set('file',new File(['%PDF-1.7'],'repeat.pdf',{type:'application/pdf'}));
    const response=await POST(new Request('http://local/api/knowledge/uploads',{method:'POST',body:form}));
    expect(response.status).toBe(200);expect(await response.json()).toEqual({id:'existing',status:'registered',reused:true});
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('requires a paired document and observed version for revision uploads',async()=>{
    const form=new FormData();form.set('collection','industry');form.set('title','Revised document');
    form.set('file',new File(['%PDF-1.7'],'revision.pdf',{type:'application/pdf'}));
    form.set('revisionDocumentId','00000000-0000-4000-8000-000000000010');
    expect((await POST(new Request('http://local/api/knowledge/uploads',{method:'POST',body:form}))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
    form.set('revisionBaseVersionId','00000000-0000-4000-8000-000000000011');
    expect((await POST(new Request('http://local/api/knowledge/uploads',{method:'POST',body:form}))).status).toBe(202);
    expect(mocks.create).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({revisionDocumentId:'00000000-0000-4000-8000-000000000010',revisionBaseVersionId:'00000000-0000-4000-8000-000000000011'}));
  });
  it("rejects an oversized declared multipart request before reading the body",async()=>{
    const response=await POST(new Request("http://local/api/knowledge/uploads",{method:"POST",headers:{authorization:"Bearer test-token","content-length":String(26*1024*1024)}}));
    expect(response.status).toBe(413);expect(mocks.create).not.toHaveBeenCalled();
  });
  it("queues a validated multipart file without indexing in the request",async()=>{
    const form=new FormData();form.set("collection","product");form.set("title","Router datasheet");form.set("entityKey","MODEL-X");
    form.set("file",new File(["%PDF-1.7"],"datasheet.pdf",{type:"application/pdf"}));
    const response=await POST(new Request("http://local/api/knowledge/uploads",{method:"POST",headers:{authorization:"Bearer test-token"},body:form}));
    expect(response.status).toBe(202);expect(mocks.create).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001",expect.objectContaining({collection:"product",entityKey:"MODEL-X",visibility:"private"}));
  });
  it("allows an authenticated member to queue a private file without an admin token",async()=>{
    mocks.session.mockResolvedValue({userId:"00000000-0000-4000-8000-000000000002",displayName:"Member",role:"member"});
    const form=new FormData();form.set("collection","company");form.set("title","Private brief");
    form.set("file",new File(["%PDF-1.7"],"private.pdf",{type:"application/pdf"}));
    const response=await POST(new Request("http://local/api/knowledge/uploads",{method:"POST",body:form}));
    expect(response.status).toBe(202);
    expect(mocks.create).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000002",expect.objectContaining({visibility:"private"}));
  });
  it("does not let a member publish a shared upload",async()=>{
    mocks.session.mockResolvedValue({userId:"00000000-0000-4000-8000-000000000002",displayName:"Member",role:"member"});
    const form=new FormData();form.set("collection","company");form.set("title","Shared brief");form.set("visibility","shared");
    form.set("file",new File(["%PDF-1.7"],"shared.pdf",{type:"application/pdf"}));
    const response=await POST(new Request("http://local/api/knowledge/uploads",{method:"POST",headers:{authorization:"Bearer test-token"},body:form}));
    expect(response.status).toBe(403);expect(mocks.create).not.toHaveBeenCalled();
  });
});
