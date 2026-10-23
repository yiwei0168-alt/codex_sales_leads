/** Literal, local candidate retrieval only; these terms never establish identity. */
export function companyQueryPatterns(input:string):string[]{
 const text=input.normalize('NFKC').trim().toLowerCase();
 if(!text)return [];
 const terms=[text];
 try{const url=new URL(text.includes('://')?text:`https://${text}`);if(url.hostname.includes('.'))terms.push(url.hostname.replace(/^www\./,''));}catch{/* A company name is not necessarily a hostname. */}
 const suffixes=new Set(['gmbh','ltd','limited','inc','incorporated','llc','corp','corporation','company','co','ag','www','https','http']);
 for(const token of text.split(/[^\p{L}\p{N}]+/u))if(token.length>=3&&!suffixes.has(token))terms.push(token);
 return [...new Set(terms)].slice(0,8).map(term=>`%${term.replace(/[\\%_]/g,'\\$&')}%`);
}
