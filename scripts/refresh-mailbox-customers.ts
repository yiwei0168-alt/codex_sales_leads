import nextEnv from '@next/env';
import {z} from 'zod';
import {discoverMailboxCustomers,listMailboxCustomers,readCustomerTimeline} from '../src/lib/mailbox/customer-timeline';
import {getPool} from '../src/lib/rag/db';
nextEnv.loadEnvConfig(process.cwd());
const userId=z.uuid().parse(process.argv[2]);
try{let offset=0;for(;;){const page=await discoverMailboxCustomers(userId,offset);offset=page.nextOffset;if(!page.hasMore)break;}
 const result=await listMailboxCustomers(userId);
 const timeline=result.items[0]?await readCustomerTimeline(userId,result.items[0].id):null;
 console.log(JSON.stringify({scopedAccount:true,processedMessages:offset,countries:result.countries.length,firstPageCompanies:result.items.length,hasMore:result.hasMore,timelineReadable:Boolean(timeline),firstPageEvents:timeline?.events.length??0,cloudCalls:0}));
}finally{await getPool().end();}
