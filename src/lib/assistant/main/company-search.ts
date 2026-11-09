import {findProductActionCompanies} from '../product-actions';
import {searchMailboxCustomers} from '@/lib/mailbox/customer-search';
export async function searchOwnedCompanies(userId:string,input:{query:string;countryCode?:string}){
 const [saved,mailboxCustomers]=await Promise.all([
  findProductActionCompanies(userId,{kind:'library',companyQuery:input.query,countryCode:input.countryCode}),
  searchMailboxCustomers(userId,input.query,input.countryCode),
 ]);
 const mailbox=mailboxCustomers.items[0],sales=saved.companies[0];
 // Two store records are not two mailbox timelines. Only a single confirmed
 // mailbox candidate with the exact same nonempty stored domain/country gets
 // this read-scoped hint. Keep both IDs and global selection semantics intact.
 const mailboxTimelineUnambiguous=!saved.hasMore&&!mailboxCustomers.hasMore&&mailboxCustomers.items.length===1&&saved.companies.length===1
  &&mailbox.confirmed===true&&Boolean(mailbox.domain?.trim())&&Boolean(mailbox.country?.trim())
  &&mailbox.domain.trim().toLowerCase()===sales.domain?.trim().toLowerCase()&&mailbox.country===sales.countryCode;
 return {...saved,mailboxCustomers,matching:{kind:'name-or-domain-candidates',requiresSelection:saved.companies.length+mailboxCustomers.items.length>1||saved.hasMore||mailboxCustomers.hasMore,
  mailboxTimelineUnambiguous,
  guidance:'Mailbox customer IDs are for customer_timeline; sales candidate IDs are for company_read. mailboxTimelineUnambiguous only permits reading the single confirmed mailbox timeline when both store records have exactly the same domain and country; it never merges IDs or confirms legal identity. Matches remain candidates. Never merge automatically. Empty results cover only the queried owned stores and optional country.'}};
}
