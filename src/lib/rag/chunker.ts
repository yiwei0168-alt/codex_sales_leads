import { createHash } from "node:crypto";
import type { TextChunk } from "./types";

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
