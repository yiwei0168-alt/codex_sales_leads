// Read-only tool capture. No answer model, no automatic quality score, no holdout reads.
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {knowledgeOriginalsTool} from '../src/lib/assistant/main/knowledge-originals-tool';
import {knowledgeCompareTool} from '../src/lib/assistant/main/knowledge-compare-tool';
import {MODE_PROMPT_VERSION} from '../src/lib/assistant/main/mode-prompts';
import {getPool} from '../src/lib/rag/db';
import type {RetrievedChunk} from '../src/lib/rag/types';
import {captureDevelopmentReceipt,developmentCaseSchema,saveDevelopmentReceipt} from '../src/lib/knowledge/evaluation/development-receipt';
const [file,user]=process.argv.slice(2);
if(!file||!user)throw Error('Usage: capture-knowledge-development-local.ts <development-case.json> <authorized-user-uuid>');
const userId=z.uuid().parse(user);
const database=new URL(process.env.DATABASE_URL??'http://invalid');
if(!['localhost','127.0.0.1'].includes(database.hostname))throw Error('Local database required');
globalThis.fetch=async()=>{throw Error('HTTP disabled: this command cannot call a model');};
const testCase=developmentCaseSchema.parse(JSON.parse(await readFile(file,'utf8')));
try{
 const context={userId,runId:'development-read-only',leaseToken:'none',role:'member' as const,knowledgeScope:['product'] as ['product']};
 const output=testCase.tool==='knowledge_originals'
   ?await knowledgeOriginalsTool.execute(knowledgeOriginalsTool.input.parse(testCase.arguments),context)
   :await knowledgeCompareTool.execute(knowledgeCompareTool.input.parse(testCase.arguments),context);
 const data=output.data as {kind:string;entities?:Array<{evidence:RetrievedChunk[]}>};
 const evidence=[...new Map((data.entities??[]).flatMap(e=>e.evidence).map(e=>[e.id,e])).values()];
 const receipt=captureDevelopmentReceipt({case:testCase,output,kind:data.kind,promptVersion:MODE_PROMPT_VERSION,evidence});
 const path=await saveDevelopmentReceipt(receipt);
 console.log(JSON.stringify({path,kind:receipt.kind,evidence:evidence.length,model:'not-invoked',externalCalls:0,semanticReview:receipt.semanticReview,releaseEligible:false}));
}finally{await getPool().end();}
