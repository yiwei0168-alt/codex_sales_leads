import { createHash } from "node:crypto";
import type { StructuredKnowledgeBlock, TextChunk, TextChunkV2 } from "./types";

export interface ChunkOptions {
  maxCharacters?: number;
  overlapCharacters?: number;
  minCharacters?: number;
}

interface Section {
  headings: string[];
  text: string;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseMarkdownSections(input: string): Section[] {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const headingStack: string[] = [];
  const sections: Section[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) sections.push({ headings: [...headingStack], text });
    buffer = [];
  };

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (!match) {
      buffer.push(line);
      continue;
    }
    flush();
    const level = match[1].length;
    headingStack.splice(level - 1);
    headingStack[level - 1] = match[2].trim();
  }
  flush();
  return sections;
}

function splitLongText(text: string, maxCharacters: number, overlap: number): string[] {
  if (text.length <= maxCharacters) return [text];
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxCharacters) {
      chunks.push(current.trim());
      const tail = current.slice(Math.max(0, current.length - overlap));
      current = `${tail}\n\n${paragraph}`;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }

    while (current.length > maxCharacters) {
      let splitAt = current.lastIndexOf("。", maxCharacters);
      if (splitAt < maxCharacters * 0.55) splitAt = current.lastIndexOf(" ", maxCharacters);
      if (splitAt < maxCharacters * 0.55) splitAt = maxCharacters;
      chunks.push(current.slice(0, splitAt + 1).trim());
      current = current.slice(Math.max(0, splitAt + 1 - overlap)).trim();
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function chunkDocument(input: string, options: ChunkOptions = {}): TextChunk[] {
  const maxCharacters = options.maxCharacters ?? 1800;
  const overlap = Math.min(options.overlapCharacters ?? 180, Math.floor(maxCharacters / 3));
  const minCharacters = options.minCharacters ?? 80;
  const sections = parseMarkdownSections(input);
  const raw = sections.flatMap((section) =>
    splitLongText(section.text, maxCharacters, overlap).map((content) => ({
      headings: section.headings,
      content,
    })),
  );

  const merged: Array<{ headings: string[]; content: string }> = [];
  for (const item of raw) {
    if (item.content.length < minCharacters && merged.length > 0) {
      merged[merged.length - 1].content += `\n\n${item.content}`;
    } else {
      merged.push(item);
    }
  }

  return merged.map((item, index) => {
    const prefix = item.headings.length ? `${item.headings.join(" > ")}\n\n` : "";
    const content = `${prefix}${item.content}`.trim();
    return {
      index,
      headingPath: item.headings,
      content,
      tokenEstimate: Math.ceil(content.length / 3.2),
      contentSha256: sha256(content),
    };
  });
}

export function chunkDocumentV2(blocks: readonly StructuredKnowledgeBlock[],options:{maxTokens?:300|500|800}={}):TextChunkV2[]{
  const maxTokens=options.maxTokens??500;const maxChars=Math.floor(maxTokens*3.2);const output:TextChunkV2[]=[];
  for(const block of blocks){
    if(block.quality!=="success"||(!block.text.trim()&&!block.table))continue;
    const parentKey=`${block.unitType}:${block.unitIndex}:${block.section??block.id}`;const headings=block.headingPath??(block.section?[block.section]:[]);
    if(block.table){const header=block.table.headers.join(" | ");let rows:string[]=[];let rowStart=block.table.startRow??1;
      const flush=()=>{if(!rows.length)return;const content=[headings.join(" > "),header,...rows,...(block.table?.footnotes??[])].filter(Boolean).join("\n");output.push({index:output.length,parentKey,blockType:"table-row",sourceLocation:{unitType:block.unitType,unitIndex:block.unitIndex,rowStart,rowEnd:rowStart+rows.length-1},headingPath:headings,content,tokenEstimate:Math.ceil(content.length/3.2),contentSha256:sha256(content)});rowStart+=rows.length;rows=[];};
      for(const row of block.table.rows){const line=row.join(" | ");if(rows.length&&[headings.join(" > "),header,...rows,line,...(block.table.footnotes??[])].join("\n").length>maxChars)flush();rows.push(line);}flush();continue;}
    const pieces=splitLongText(block.text,maxChars,0);for(const piece of pieces){const content=[headings.join(" > "),piece].filter(Boolean).join("\n\n");output.push({index:output.length,parentKey,blockType:block.blockType,sourceLocation:{unitType:block.unitType,unitIndex:block.unitIndex},headingPath:headings,content,tokenEstimate:Math.ceil(content.length/3.2),contentSha256:sha256(content)});}
  }
  return output;
}
