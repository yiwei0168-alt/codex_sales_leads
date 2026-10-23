import {expect,it} from 'vitest';
import {companyQueryPatterns} from './company-query';
it('retrieves brand tokens from full names and URLs without inventing a legal identity',()=>{
 expect(companyQueryPatterns('Reichelt Elektronik GmbH')).toContain('%reichelt%');
 expect(companyQueryPatterns('https://www.reichelt.de/catalog')).toContain('%reichelt.de%');
 expect(companyQueryPatterns(' Reichelt ')).toEqual(['%reichelt%']);
 expect(companyQueryPatterns('a%b_')).toEqual(['%a\\%b\\_%']);
 expect(companyQueryPatterns('   ')).toEqual([]);
});
