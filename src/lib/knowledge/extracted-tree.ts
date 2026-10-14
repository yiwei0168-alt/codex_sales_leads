import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
export type Block={id:string;unitType:"page"|"slide"|"sheet"|"document";unitIndex:number;blockType:string;quality:string;review?:{receiptId:string;revision:number;decision:string;originalQuality:string};text?:string;section?:string;bbox?:number[];shapePath?:number[];shapeIdPath?:number[];table?:{headers?:unknown[];rows?:unknown[][];startRow?:number;headerRow?:number;startColumn?:number;cellRange?:string}};
const unitKey=(block:Block)=>`${block.unitType}:${block.unitIndex}`;
export function visualSourceLocation(block:Block & {visualReference?:{kind:string;worksheetPart:string;relationshipId:string|null}}){
 const reference=block.visualReference;if(!reference)return {};
 if(block.unitType!=='sheet'||!block.section?.trim()||!['drawing','legacyDrawing','legacyDrawingHF','picture','oleObjects','controls'].includes(reference.kind)
  ||!/^xl\/[A-Za-z0-9_./-]+\.xml$/.test(reference.worksheetPart)||reference.worksheetPart.split('/').includes('..')
  ||(reference.relationshipId!==null&&(typeof reference.relationshipId!=='string'||reference.relationshipId.length>300)))throw new Error('Invalid sheet visual reference');
 return {sheetName:block.section,visualReference:reference};
}
export function slideShapeLocation(block:Block){
  if(block.shapePath===undefined&&block.shapeIdPath===undefined)return {};
  if(block.unitType!=="slide"||!Array.isArray(block.shapePath)||!Array.isArray(block.shapeIdPath)
    ||!block.shapePath.length||block.shapePath.length!==block.shapeIdPath.length
    ||[...block.shapePath,...block.shapeIdPath].some(value=>!Number.isSafeInteger(value)||value<1))throw new Error("Invalid slide shape path");
  return {shapePath:block.shapePath,shapeIdPath:block.shapeIdPath};
}
const columnName=(index:number):string=>{
  let name="";
  for(let n=index;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;
  return name;
};
export function spreadsheetLocation(block:Block){
  const table=block.table;
  if(block.unitType!=="sheet"||!table?.cellRange)return null;
  const rows=[table.headers??[],...(table.rows??[])];
  const firstRow=table.headerRow,firstColumn=table.startColumn;
  const width=rows[0].length;
  if(typeof firstRow!=="number"||typeof firstColumn!=="number"||!Number.isInteger(firstRow)||!Number.isInteger(firstColumn)||firstRow<1||firstColumn<1
    ||!width||rows.some(row=>row.length!==width)||table.startRow!==firstRow+1
    ||firstRow+rows.length-1>1048576||firstColumn+width-1>16384)throw new Error("Invalid spreadsheet coordinates");
  const range=`${columnName(firstColumn)}${firstRow}:${columnName(firstColumn+width-1)}${firstRow+rows.length-1}`;
  if(table.cellRange!==range||!block.section?.trim())throw new Error("Spreadsheet range does not match original grid");
  return {sheetName:block.section,cellRange:range,headerRow:firstRow,startColumn:firstColumn};
}
export function evidenceText(block:Block):string{
  if(block.blockType==="table"&&block.table){
    const rows=[block.table.headers??[],...(block.table.rows??[])];
    const location=spreadsheetLocation(block);
    if(location)return rows.flatMap((row,rowIndex)=>row.flatMap((cell,columnIndex)=>{
      const value=String(cell??"").replaceAll("\t"," ").replaceAll("\n"," ");
      return value.trim()?[`${columnName(location.startColumn+columnIndex)}${location.headerRow+rowIndex}: ${value}`]:[];
    })).join("\n");
    return rows.map(row=>row.map(cell=>String(cell??"").replaceAll("\t"," ").replaceAll("\n"," ")).join("\t")).join("\n").trim();
  }
  return block.text?.trim()??"";
}

const spreadsheetCachedError=/^#(?:NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|SPILL!|CALC!|FIELD!|GETTING_DATA|BLOCKED!|CONNECT!|UNKNOWN!)$/i;
/** A cached formula error is not a usable source value, even when extraction marked the table successful. */
export function assertNoSpreadsheetCachedErrors(blocks:Block[]){
  for(const block of blocks){
    if(block.unitType!=="sheet"||block.quality!=="success"||block.blockType!=="table"||!block.table)continue;
    const rows=[block.table.headers??[],...(block.table.rows??[])];
    for(const [rowIndex,row] of rows.entries())for(const [columnIndex,cell] of row.entries()){
      if(typeof cell==="string"&&spreadsheetCachedError.test(cell.trim())){
        const rowNumber=(block.table.headerRow??1)+rowIndex;
        const column=columnName((block.table.startColumn??1)+columnIndex);
        throw new Error(`Spreadsheet cached error requires source review: ${block.id} ${column}${rowNumber}`);
      }
    }
  }
}


/** Caller owns the document lock and transaction. Does not switch the current pointer. */
export async function writeExtractedTree(client:PoolClient,input:{documentId:string;assetId:string;sourceSha256:string;extractorVersion:string;artifactHash:string;blocks:Block[]}){
  if(input.blocks.some(block=>!["success","blank"].includes(block.quality)))throw new Error("Unresolved extraction units");
  assertNoSpreadsheetCachedErrors(input.blocks);
  const blocks=input.blocks.filter(block=>block.quality==="success"&&evidenceText(block));
  for(const block of blocks)slideShapeLocation(block);
  if(!blocks.length||blocks.some(block=>!block.id||!Number.isInteger(block.unitIndex)||block.unitIndex<1))throw new Error("No complete evidence blocks");
  const units=[...new Map(blocks.map(block=>[unitKey(block),block])).values()];
    const existing=await client.query<{id:string;status:string;artifact_sha256:string}>(`select id,status,artifact_sha256 from knowledge_tree_version where document_id=$1 and source_sha256=$2 and extractor_version=$3 for update`,
      [input.documentId,input.sourceSha256,input.extractorVersion]);
    if(existing.rows[0]&&existing.rows[0].artifact_sha256!==input.artifactHash)throw new Error("Conflicting artifact for document source and extractor version");
    if(existing.rows[0]?.status==="ready"){
      return {versionId:existing.rows[0].id,reused:true,nodes:blocks.length+units.length};
    }
    const version=existing.rows[0]??(await client.query<{id:string}>(`insert into knowledge_tree_version(document_id,asset_id,source_sha256,extractor_version,artifact_sha256)
      values($1,$2,$3,$4,$5) returning id`,[input.documentId,input.assetId,input.sourceSha256,input.extractorVersion,input.artifactHash])).rows[0];
    await client.query("delete from knowledge_tree_node where version_id=$1",[version.id]);
    const parents=new Map<string,string>();
    for(const [ordinal,block] of units.entries()){
      const title=block.section?.trim()||`${block.unitType} ${block.unitIndex}`;
      const inserted=await client.query<{id:string}>(`insert into knowledge_tree_node(version_id,ordinal,node_kind,title,heading_path,unit_type,unit_index,source_location)
        values($1,$2,'unit',$3,$4,$5,$6,$7) returning id`,[version.id,ordinal,title,[title],block.unitType,block.unitIndex,JSON.stringify({unitType:block.unitType,unitIndex:block.unitIndex})]);
      parents.set(unitKey(block),inserted.rows[0].id);
    }
    for(const [ordinal,block] of blocks.entries()){
      const parent=parents.get(unitKey(block));if(!parent)throw new Error("Missing unit parent");
      const content=evidenceText(block);
      await client.query(`insert into knowledge_tree_node(version_id,parent_id,ordinal,node_kind,title,heading_path,unit_type,unit_index,source_location,content,content_sha256)
        values($1,$2,$3,'evidence',$4,$5,$6,$7,$8,$9,$10)`,[version.id,parent,ordinal,block.id,[block.section??`${block.unitType} ${block.unitIndex}`],block.unitType,block.unitIndex,
          JSON.stringify({unitType:block.unitType,unitIndex:block.unitIndex,blockId:block.id,bbox:block.bbox??null,startRow:block.table?.startRow??null,...(spreadsheetLocation(block)??{}),...slideShapeLocation(block),...visualSourceLocation(block),...(block.review?{extractionReview:block.review}:{})}),content,digest(content)]);
    }
    const count=await client.query<{count:string}>("select count(*)::text as count from knowledge_tree_node where version_id=$1",[version.id]);
    if(Number(count.rows[0].count)!==blocks.length+units.length)throw new Error("Tree completeness check failed");
    await client.query("update knowledge_tree_version set status='ready',ready_at=now(),error_code=null where id=$1",[version.id]);
    return {versionId:version.id,reused:false,nodes:blocks.length+units.length};
}
