// Chunking of extracted file text and index documents from a transcript. Pure.
import type { Part, Transcript } from "@cb/schema";
import { countTokens } from "@cb/tokens";
import type { IndexDoc } from "./bm25.js";

/** A chunk: an exact slice of the source text starting at `offset` (characters). */
export type ChunkSpan = { offset: number; text: string };

type Range = { start: number; end: number };

/** Ranges of `text` between matches of `sep`, inside `r`, trimmed and non-empty. */
function splitRange(text: string, r: Range, sep: RegExp): Range[] {
  const out: Range[] = [];
  const push = (start: number, end: number): void => {
    while (start < end && /\s/.test(text[start]!)) start++;
    while (end > start && /\s/.test(text[end - 1]!)) end--;
    if (end > start) out.push({ start, end });
  };
  const slice = text.slice(r.start, r.end);
  let from = 0;
  for (const m of slice.matchAll(sep)) {
    push(r.start + from, r.start + m.index);
    from = m.index + m[0].length;
  }
  push(r.start + from, r.end);
  return out;
}

/** Hard split of one range that has no usable boundary: the longest prefixes that fit. */
function splitByLength(text: string, r: Range, maxTokens: number): Range[] {
  const out: Range[] = [];
  let start = r.start;
  while (start < r.end) {
    let lo = start + 1;
    let hi = r.end;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (countTokens(text.slice(start, mid)) <= maxTokens) lo = mid;
      else hi = mid - 1;
    }
    // Keep surrogate pairs together.
    if (lo < r.end && lo > start + 1 && /[\uDC00-\uDFFF]/.test(text[lo]!)) lo--;
    out.push({ start, end: lo });
    start = lo;
  }
  return out;
}

const LEVELS: RegExp[] = [
  /\n[ \t]*\n\s*/g, // paragraphs
  /(?<=[.!?])\s+/g, // sentences
  /\s+/g, // words
];

function pack(text: string, ranges: Range[], level: number, maxTokens: number): Range[] {
  const fits = (start: number, end: number): boolean =>
    countTokens(text.slice(start, end)) <= maxTokens;
  const out: Range[] = [];
  let cur: Range | undefined;
  for (const r of ranges) {
    if (cur && fits(cur.start, r.end)) {
      cur = { start: cur.start, end: r.end };
      continue;
    }
    if (cur) out.push(cur);
    cur = undefined;
    if (fits(r.start, r.end)) {
      cur = r;
      continue;
    }
    // Too big on its own: split at the next finer boundary (last resort: by length) and pack again.
    const sep = LEVELS[level + 1];
    out.push(
      ...(sep
        ? pack(text, splitRange(text, r, sep), level + 1, maxTokens)
        : splitByLength(text, r, maxTokens)),
    );
  }
  if (cur) out.push(cur);
  return out;
}

/** Chunks of at most `maxTokens`, split on paragraph, then sentence boundaries, with their offsets. */
export function chunkSpans(text: string, maxTokens = 500): ChunkSpan[] {
  const paragraphs = splitRange(text, { start: 0, end: text.length }, LEVELS[0]!);
  return pack(text, paragraphs, 0, maxTokens).map((r) => ({
    offset: r.start,
    text: text.slice(r.start, r.end),
  }));
}

/** Chunks of at most `maxTokens`, split on paragraph, then sentence boundaries. */
export function chunkText(text: string, maxTokens = 500): string[] {
  return chunkSpans(text, maxTokens).map((c) => c.text);
}

function partText(part: Part): string {
  switch (part.kind) {
    case "text":
      return part.text;
    case "code":
    case "tool_output":
      return part.content;
    case "table":
      return part.markdown;
    case "math":
      return part.latex;
    case "citation":
      return part.title === undefined ? part.url : `${part.title} ${part.url}`;
    case "attachment":
      return "";
  }
}

/**
 * One document per turn (`t012`, code included) and one per chunk of each extracted file text
 * (`a002#c3`, 1-based, with the chunk's character `offset`). Attachments are ordered by id.
 */
export function docsFromTranscript(
  transcript: Transcript,
  extractedTexts: ReadonlyMap<string, string>,
): IndexDoc[] {
  const docs: IndexDoc[] = [];
  for (const turn of transcript.turns) {
    const text = turn.parts
      .map(partText)
      .filter((t) => t.trim() !== "")
      .join("\n\n");
    if (text !== "") docs.push({ ref: turn.id, text });
  }
  const ids = [...extractedTexts.keys()].sort();
  for (const id of ids) {
    chunkSpans(extractedTexts.get(id)!).forEach((c, i) => {
      docs.push({ ref: `${id}#c${i + 1}`, text: c.text, offset: c.offset });
    });
  }
  return docs;
}
