import {expect,it,vi} from 'vitest';
import {executeHybridRead,type HybridDependencies} from './hybrid-execution';
import {executeProgrammatic} from './programmatic-execution';
import {HYBRID_LEAVES,hybridDataSchema} from './hybrid-contracts';
import {result,type ExecutionContext} from './contracts';

const context:ExecutionContext={userId:'owner',runId:'run',leaseToken:'lease',role:'member',callId:'parent'};
const customer='11111111-1111-4111-8111-111111111111';
const ids=Array.from({length:4},(_,i)=>`22222222-2222-4222-8222-22222222222${i}`);
for(const route of ['workflow','interpreter','programmatic'] as const){
 it.each([{events:4,hasMore:false},{events:4,hasMore:true},{events:3,hasMore:false},{events:3,hasMore:true}])(
  `${route} distinguishes unread listed bodies from later timeline pages (%j)`,async({events,hasMore})=>{
   const deps:HybridDependencies={allowed:HYBRID_LEAVES,validate:vi.fn(async()=>{}),dispatch:vi.fn(async call=>{
    const request=JSON.parse(call.function.arguments);
    if(request.tool==='company_search')return result({matching:{requiresSelection:false},mailboxCustomers:{items:[{id:customer}],hasMore:false}});
    if(request.tool==='customer_timeline')return result({events:ids.slice(0,events).map(id=>({id,excerpt:'Timeline excerpt'})),hasMore});
    expect(request.tool).toBe('mail_read');return result({id:request.arguments.messageId,bodyText:'Original body'});
   })};
   const recipe={workflow:'customer_recent',query:'Synthetic customer',messageLimit:3};
   const program={code:`return tools.workflow(${JSON.stringify(recipe)});`};
   const output=route==='programmatic'?await executeProgrammatic(program,context,deps):
    await executeHybridRead(route,route==='workflow'?recipe:program,context,deps);
   expect(output.status).toBe('success');
   const data=hybridDataSchema.parse(output.data),coverage=data.coverage.join('\n');
   expect(data.leaves.filter(l=>l.tool==='mail_read').map(l=>l.arguments.messageId)).toEqual(ids.slice(0,3));
   expect(deps.dispatch).toHaveBeenCalledTimes(5);
   expect(coverage).toContain(`lists ${events} events; read 3`);
   if(events===4)expect(coverage).toContain('1 listed event(s) on this page have unread bodies');
   else {expect(coverage).toContain('Every message body on the returned timeline page was read');expect(coverage).not.toContain('have unread bodies');}
   if(hasMore){expect(coverage).toContain('reports another page');expect(coverage).toContain('their count is unknown');expect(coverage).not.toContain('hasMore=false');}
   else {expect(coverage).toContain('reports no further page (hasMore=false)');expect(coverage).not.toContain('reports another page');}
   expect(coverage).not.toContain('Additional messages exist.');
  });
}
