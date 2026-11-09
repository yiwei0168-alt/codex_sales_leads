import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=s=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
const fixture=JSON.parse(await readFile('experiments/hybrid-evaluation-v1/business-fixtures.json','utf8'));
const binding=JSON.parse(await readFile('.local-runtime/hybrid-evaluation-v1/mail-binding.json','utf8'));
const expected=fixture.companies.map(c=>{
 const latest=fixture.mails.filter(m=>m.companyId===c.id).sort((a,b)=>b.date.localeCompare(a.date))[0];
 return {company:c.name,id:binding.companyIds[c.id],date:latest.date.slice(0,10),message:binding.messageIds[latest.id]};
}).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
const results=[];
for(const file of (await readdir('.local-runtime/hybrid-evaluation-v2/performance')).filter(f=>/^P09-.*\.trace\.json$/.test(f))){
 const trace=JSON.parse(await readFile(`.local-runtime/hybrid-evaluation-v2/performance/${file}`,'utf8'));
 const answer=trace.final?.result?.reply??'',lines=answer.split('\n').filter(l=>l.startsWith('|')&&expected.some(e=>l.includes(e.id)));
 const checks=expected.map((e,i)=>({company:e.company,correctTablePosition:lines[i]?.includes(e.id)??false,
  correctDate:lines[i]?.includes(e.date)??false,correctLatestMailCitation:lines[i]?.includes(`/api/mailbox/messages/${e.message}`)??false}));
 results.push({file,answerHash:sha(answer),matchedTableRows:lines.length,passed:lines.length===12&&checks.every(c=>c.correctTablePosition&&c.correctDate&&c.correctLatestMailCitation),checks});
}
const report={version:'p09-answer-fixture-check-v2',scope:'Post-hoc deterministic table/order/date/citation check, not independent semantic acceptance. Non-table answers require separate review.',results};
await writeFile('experiments/hybrid-evaluation-v2/results/p09-answer-checks.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(results.map(({file,passed,matchedTableRows})=>({file,passed,matchedTableRows})),null,2));
