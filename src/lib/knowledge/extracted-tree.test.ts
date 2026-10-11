import {expect,it,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {evidenceText,spreadsheetLocation,writeExtractedTree,type Block} from './extracted-tree';

const block:Block={id:'sheet-1-table',unitType:'sheet',unitIndex:1,blockType:'table',quality:'success',section:'Original',
  table:{headers:['','',''],rows:[['','Value',''],['','',''],['',0,false],['','',''],['',-1.5,'']],
    startRow:2,headerRow:1,startColumn:1,cellRange:'A1:C6'}};
it('preserves explicit source addresses despite blank rows and columns',()=>{
  expect(evidenceText(block)).toBe('B2: Value\nB4: 0\nC4: false\nB6: -1.5');
  expect(spreadsheetLocation(block)).toEqual({sheetName:'Original',cellRange:'A1:C6',headerRow:1,startColumn:1});
});
it('rejects forged ranges and inconsistent physical grids',()=>{
  for(const table of [{...block.table,cellRange:'A1:C5'},{...block.table,startRow:3},{...block.table,startColumn:0},
    {...block.table,headerRow:1048576},{...block.table,rows:[['short']]}]){
    expect(()=>evidenceText({...block,table})).toThrow();
  }
});
it('handles columns beyond Z',()=>{
  expect(evidenceText({...block,table:{headers:['x',0],rows:[],headerRow:9,startRow:10,startColumn:26,cellRange:'Z9:AA9'}}))
    .toBe('Z9: x\nAA9: 0');
});
it('saves cell range and sheet name in the evidence source location',async()=>{
  const query=vi.fn().mockResolvedValue({rows:[]});
  query.mockImplementation(async(sql:string)=>{
    if(sql.includes('insert into knowledge_tree_version'))return {rows:[{id:'version'}]};
    if(sql.includes("'unit'"))return {rows:[{id:'parent'}]};
    if(sql.includes('count(*)'))return {rows:[{count:'2'}]};
    return {rows:[]};
  });
  await writeExtractedTree({query} as unknown as PoolClient,{documentId:'doc',assetId:'asset',sourceSha256:'a'.repeat(64),
    extractorVersion:'layout-v2.0.2',artifactHash:'b'.repeat(64),blocks:[block]});
  const call=query.mock.calls.find(([sql])=>sql.includes("'evidence'"))!;
  const args=call[1] as unknown[];
  expect(JSON.parse(args[7] as string)).toMatchObject({sheetName:'Original',cellRange:'A1:C6',headerRow:1,startRow:2,startColumn:1});
  expect(args[8]).toBe('B2: Value\nB4: 0\nC4: false\nB6: -1.5');
});
