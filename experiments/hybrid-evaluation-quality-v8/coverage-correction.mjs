import {readFile,writeFile} from 'node:fs/promises';
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const rows=[];
for(const arm of ['A','B','C']){
 const trace=await read(`.local-runtime/hybrid-evaluation-v8/performance/P10-${arm}-1.trace.json`);
 const pages=trace.calls.filter(c=>c.tool_id==='mailbox_message_list'),programs=trace.calls.filter(c=>['programmatic_tools','programmatic_read'].includes(c.tool_id));
 const items=pages.flatMap(p=>p.output.data.items),unique=new Map(items.map(i=>[i.id,i])),counts={};
 for(const item of unique.values()){const day=new Date(Date.parse(item.sentAt)+480*60000).toISOString().slice(0,10);counts[day]=(counts[day]??0)+1;}
 const cycles=[];let current=[];
 for(const page of pages){if(page.input.offset===0&&current.length){cycles.push(current);current=[];}current.push(page);if(!page.output.data.hasMore){cycles.push(current);current=[];}}
 if(current.length)cycles.push(current);
 const complete=cycles.every(c=>c.length===2&&c[0].input.offset===0&&c[0].output.data.nextOffset===20&&c[1].input.offset===20&&c[1].output.data.hasMore===false);
 const range=pages.every(p=>Date.parse(p.input.from)===Date.parse('2026-11-02T00:00:00+08:00')&&Date.parse(p.input.until)===Date.parse('2026-11-06T00:00:00+08:00'));
 rows.push({arm,programAttempts:programs.length,successfulPrograms:programs.filter(p=>p.output.status==='success').length,
  pages:pages.length,completeReadPasses:cycles.length,duplicateMessageReads:items.length-unique.size,uniqueMessages:unique.size,counts,
  coveragePassed:complete&&range&&unique.size===40&&Object.entries({'2026-11-02':8,'2026-11-03':12,'2026-11-04':12,'2026-11-05':8}).every(([d,n])=>counts[d]===n),
  quotedReceiptVerified:arm==='B'?trace.calls.some(c=>c.id==='935075d7-46ae-492b-8791-6057de3e7fe0'&&c.output.callId===c.id&&c.output.status==='success'):null});
}
const report={version:'v8-posthoc-measurement-correction',rows,paidCalls:0,originalReportsRetained:true,
 explanation:'Original collector counted only programmatic_tools, omitting successful programmatic_read. Raw coverage audit also summed repeated reads instead of counting unique mail IDs. C performed two complete passes, 40 duplicate message reads; its code-generated daily counts are correct. B quoted a real program receipt omitted from the blind packet, so reviewer fabrication allegation is unsupported; absence of user-facing source URLs remains a citation usability concern. Raw blind grade is retained, no overall acceptance granted.',
 independentQualityOverride:false,overallAcceptancePassed:false};
await writeFile('experiments/hybrid-evaluation-quality-v8/results/coverage-correction.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
