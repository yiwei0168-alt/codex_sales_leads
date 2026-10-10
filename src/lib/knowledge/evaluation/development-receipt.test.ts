import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import type {RetrievedChunk} from '@/lib/rag/types';
import {captureDevelopmentReceipt as capture} from './development-receipt';
const id='11111111-1111-4111-8111-111111111111';
const content='navigation '.repeat(700)+'Important final condition.';
const evidence:RetrievedChunk={id,documentId:id,title:'Independent synthetic fixture',content,sourceType:'fixture',
 collection:'product',authorityLevel:3,headingPath:[],retrievalSignals:['keyword'],corroborated:false,score:1,visibility:'shared',
 metadata:{releaseId:id,assetId:id,sourceRevisionId:id,sourceSha256:'a'.repeat(64),
 contentSha256:createHash('sha256').update(content).digest('hex'),sourceLocation:{unitType:'sheet',unitIndex:2,sheetName:'Fixture',rowStart:8,rowEnd:9}}};
const input={case:{split:'development',id:'synthetic-compare',question:'Compare fixtures',tool:'knowledge_compare',arguments:{}},
 output:{kind:'comparison-evidence'},kind:'comparison-evidence',promptVersion:'test',evidence:[evidence],citedChunkIds:[id]};
it('retains full tail text, exact coordinates and hashes without grading semantic quality',()=>{
 const receipt=capture(input);expect(receipt.evidence[0].text).toBe(content);
 expect(receipt.evidence[0].sourceLocation).toMatchObject({unitType:'sheet',sheetName:'Fixture',rowStart:8,rowEnd:9});
 expect(receipt.semanticReview).toBe('pending');expect(receipt.releaseEligible).toBe(false);
});
it.each(['holdout','validation'])('rejects %s inputs instead of rewriting historical candidates',split=>{
 expect(()=>capture({...input,case:{...input.case,split}})).toThrow();
});
it('rejects missing coordinates, source hashes, and shortened or altered evidence',()=>{
 for(const changed of [{...evidence,metadata:{}},{...evidence,content:content.slice(0,180)}])expect(()=>capture({...input,evidence:[changed]})).toThrow();
});
it('rejects citations that cannot be resolved to the supplied block',()=>{
 expect(()=>capture({...input,citedChunkIds:['missing']})).toThrow();
});
it.each(['deny','clarification','insufficient-evidence'])('preserves %s without converting it to a generic no-answer',kind=>{
 const receipt=capture({...input,kind,output:{kind},evidence:[],citedChunkIds:[]});expect(receipt.kind).toBe(kind);
 expect(()=>capture({...input,kind})).toThrow();
});
