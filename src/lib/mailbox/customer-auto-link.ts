import type {PoolClient} from 'pg';

export type CustomerMailIdentity={id:string;identity_key:string;domain:string|null};
export function matchingCustomerIds(customers:CustomerMailIdentity[],addresses:string[],ownEmail:string){
 const ownDomain=ownEmail.split('@')[1]?.toLowerCase();
 const external=addresses.map(a=>a.trim().toLowerCase()).filter(a=>a.includes('@')&&a.split('@')[1]!==ownDomain);
 return customers.filter(c=>c.identity_key.startsWith('address:')
  ?external.includes(c.identity_key.slice(8).toLowerCase())
  :Boolean(c.domain&&external.some(a=>{const d=a.split('@')[1],domain=c.domain!.toLowerCase();return d===domain||d.endsWith('.'+domain);}))).map(c=>c.id);
}
/** Existing confirmed customers only. No discovery, model, merge or decision overwrite. */
export async function loadAutoLinkCustomers(client:PoolClient,userId:string){
 return (await client.query<CustomerMailIdentity>(`select id,identity_key,domain from mailbox_customer
  where user_id=$1 and confirmed and customer_type='partner' and not archived and merged_into is null`,[userId])).rows;
}
export async function linkImportedCustomerMail(client:PoolClient,userId:string,messageId:string,addresses:string[],ownEmail:string,cached?:CustomerMailIdentity[]){
 const customers=cached??await loadAutoLinkCustomers(client,userId);
 const ids=matchingCustomerIds(customers,addresses,ownEmail);
 if(ids.length)await client.query(`insert into mailbox_customer_message(user_id,customer_id,message_id,source)
  select $1,c.id,$2,'suggested' from mailbox_customer c where c.user_id=$1 and c.id=any($3::uuid[])
   and c.confirmed and c.customer_type='partner' and not c.archived and c.merged_into is null
  on conflict(user_id,customer_id,message_id) do nothing`,[userId,messageId,ids]);
 return ids.length;
}
