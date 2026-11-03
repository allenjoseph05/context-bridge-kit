// BM25 index (k1 = 1.2, b = 0.75), written in-house for determinism. Pure; the index is plain JSON.
import { tokenize, tokenSpans } from "./tokenize.js";

export const K1 = 1.2;
export const B = 0.75;
export const MAX_K = 8;
export const SNIPPET_CHARS = 600;

/** A searchable document. `offset` is the character offset of an attachment chunk in its text. */
export type IndexDoc = { ref: string; text: string; offset?: number };

export type IndexJSON = {
  version: 1;
  k1: number;
  b: number;
  avgdl: number;
  docs: Array<{ ref: string; text: string; length: number; offset?: number }>;
  /** `[term, [[docIndex, termFrequency], …]]`, sorted by term; arrays, so no key is special. */
  postings: Array<[string, Array<[number, number]>]>;
};

export type SearchHit = { ref: string; score: number; snippet: string; offset?: number };

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function buildIndex(docs: ReadonlyArray<IndexDoc>): IndexJSON {
  const postings = new Map<string, Array<[number, number]>>();
  const out: IndexJSON["docs"] = [];
  let total = 0;
  docs.forEach((doc, i) => {
    const tokens = tokenize(doc.text);
    total += tokens.length;
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [term, n] of tf) {
      const list = postings.get(term);
      if (list) list.push([i, n]);
      else postings.set(term, [[i, n]]);
    }
    out.push({
      ref: doc.ref,
      text: doc.text,
      length: tokens.length,
      ...(doc.offset === undefined ? {} : { offset: doc.offset }),
    });
  });
  return {
    version: 1,
    k1: K1,
    b: B,
    avgdl: docs.length === 0 ? 0 : total / docs.length,
    docs: out,
    postings: [...postings].sort((x, y) => byString(x[0], y[0])),
  };
}

/** Up to `SNIPPET_CHARS` of `text` around the first occurrence of the highest-weighted query term. */
function snippet(text: string, weights: ReadonlyMap<string, number>): string {
  if (text.length <= SNIPPET_CHARS) return text;
  let best: { start: number; end: number; w: number } | undefined;
  for (const s of tokenSpans(text)) {
    const w = weights.get(s.token);
    if (w !== undefined && (best === undefined || w > best.w))
      best = { start: s.start, end: s.end, w };
  }
  const match = best ?? { start: 0, end: 0 };
  const centre = Math.floor((match.start + match.end) / 2);
  let start = Math.max(0, Math.min(centre - SNIPPET_CHARS / 2, text.length - SNIPPET_CHARS));
  if (match.end - start > SNIPPET_CHARS) start = match.start;
  let end = Math.min(text.length, start + SNIPPET_CHARS);
  // Do not cut words at the edges when a space lies between the edge and the match.
  if (start > 0 && /\S/.test(text[start - 1] ?? "")) {
    const space = text.slice(start, match.start).search(/\s/);
    if (space >= 0) start += space + 1;
  }
  if (end < text.length && /\S/.test(text[end] ?? "")) {
    const tail = text.slice(match.end, end);
    const space = tail.search(/\s\S*$/);
    if (space >= 0) end = match.end + space;
  }
  return text.slice(start, end).trim();
}

/** Top `k` (at most 8) documents for `query`; ties ordered by ref. Documents without a query term are omitted. */
export function search(index: IndexJSON, query: string, k: number): SearchHit[] {
  const limit = Number.isFinite(k) ? Math.max(0, Math.min(MAX_K, Math.floor(k))) : 0;
  if (limit === 0 || index.docs.length === 0) return [];
  const postings = new Map(index.postings);
  const n = index.docs.length;
  const avgdl = index.avgdl > 0 ? index.avgdl : 1;
  const scores = new Map<number, number>();
  const weights = new Map<string, number>();
  for (const term of new Set(tokenize(query))) {
    const list = postings.get(term);
    if (!list) continue;
    const idf = Math.log(1 + (n - list.length + 0.5) / (list.length + 0.5));
    weights.set(term, idf);
    for (const [d, tf] of list) {
      const dl = index.docs[d]?.length ?? 0;
      const s =
        (idf * tf * (index.k1 + 1)) / (tf + index.k1 * (1 - index.b + (index.b * dl) / avgdl));
      scores.set(d, (scores.get(d) ?? 0) + s);
    }
  }
  return [...scores]
    .map(([d, score]) => ({ doc: index.docs[d]!, score }))
    .sort((x, y) => y.score - x.score || byString(x.doc.ref, y.doc.ref))
    .slice(0, limit)
    .map(({ doc, score }) => ({
      ref: doc.ref,
      score,
      snippet: snippet(doc.text, weights),
      ...(doc.offset === undefined ? {} : { offset: doc.offset }),
    }));
}
