import {findProductActionCompanies} from '../product-actions';
import {searchMailboxCustomers} from '@/lib/mailbox/customer-search';
export async function searchOwnedCompanies(userId:string,input:{query:string;countryCode?:string}){
 const [saved,mailboxCustomers]=await Promise.all([
  findProductActionCompanies(userId,{kind:'library',companyQuery:input.query,countryCode:input.countryCode}),
  searchMailboxCustomers(userId,input.query,input.countryCode),
 ]);
 return {...saved,mailboxCustomers,matching:{kind:'name-or-domain-candidates',requiresSelection:saved.companies.length+mailboxCustomers.items.length>1||saved.hasMore||mailboxCustomers.hasMore,
  guidance:'Mailbox customer IDs are for customer_timeline; sales candidate IDs are for company_read. Matches are candidates, not verified aliases or legal identities. Never merge automatically. Empty results cover only the queried owned stores and optional country.'}};
}
