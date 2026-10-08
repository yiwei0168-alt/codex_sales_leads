import {expect,it,vi} from 'vitest';
vi.mock('@/lib/rag/db',()=>({tenantQuery:vi.fn(),tenantTransaction:vi.fn()}));
import {customerIdentity,customerEditSchema} from './customer-timeline';
import {validateTimelineExtraction} from './timeline-local';
it('groups company domains and keeps unrelated public-mail users apart',()=>{
 expect(customerIdentity('Alice@Example.com')?.key).toBe(customerIdentity('bob@example.com')?.key);
 expect(customerIdentity('a@gmail.com')?.key).not.toBe(customerIdentity('b@gmail.com')?.key);
 expect(customerIdentity('invalid')).toBeNull();
});
it('requires source quote for important inferred claims',()=>{
 const note={important:true,kind:'quote',summary:'已报价',quote:'confirmed order',companyName:'',country:''};
 expect(()=>validateTimelineExtraction(note,'Quote only, no order')).toThrow();
 expect(validateTimelineExtraction({...note,quote:'Quote only'},'Quote only, no order').quote).toBe('Quote only');
});
it('allows only the three requested relationship types and versioned edits',()=>{
 const value={id:'11111111-1111-4111-8111-111111111111',revision:1,name:'Example',country:null,customer_type:'partner',notes:'Prefer email',confirmed:false,archived:false};
 expect(customerEditSchema.safeParse(value).success).toBe(true);
 expect(customerEditSchema.safeParse({...value,customer_type:'auto-won'}).success).toBe(false);
 expect(customerEditSchema.safeParse({...value,revision:undefined}).success).toBe(false);
});
