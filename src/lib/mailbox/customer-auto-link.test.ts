import {expect,it,vi} from 'vitest';
import {matchingCustomerIds,linkImportedCustomerMail} from './customer-auto-link';
import type {PoolClient} from 'pg';
const customers=[{id:'company',identity_key:'domain:example.test',domain:'example.test'},
 {id:'person',identity_key:'address:person@gmail.com',domain:'gmail.com'},
 {id:'own',identity_key:'domain:owner.test',domain:'owner.test'}];
it('matches business domains and subdomains without matching lookalikes or own mail',()=>{
 expect(matchingCustomerIds(customers,['sales@EXAMPLE.TEST','x@mail.example.test','me@owner.test'],'me@owner.test')).toEqual(['company']);
 expect(matchingCustomerIds(customers,['sales@notexample.test','sales@example.test.attacker.test'],'me@owner.test')).toEqual([]);
});
it('matches public mailboxes individually',()=>{
 expect(matchingCustomerIds(customers,['other@gmail.com'],'me@owner.test')).toEqual([]);
 expect(matchingCustomerIds(customers,['Person@gmail.com'],'me@owner.test')).toEqual(['person']);
});
it('preserves explicitly rejected links and only inserts owned existing-customer rows',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[]});
 await linkImportedCustomerMail({query} as unknown as PoolClient,'owner','message',['person@gmail.com'],'me@owner.test',customers);
 expect(query).toHaveBeenCalledWith(expect.stringContaining('on conflict(user_id,customer_id,message_id) do nothing'),['owner','message',['person']]);
 expect(query.mock.calls[0][0]).toContain("c.customer_type='partner'");
});
