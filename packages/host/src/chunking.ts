// Transport-level chunking of host → extension messages (protocol.md §Framing).
import { randomUUID } from "node:crypto";
import type { Chunk, HostToExt } from "@cb/schema";

/** Host → extension messages whose JSON exceeds this many bytes are split into `chunk` messages. */
export const MAX_OUTGOING_JSON_BYTES = 900_000;

/** Bytes `ch` (one code point) takes inside a JSON string literal produced by JSON.stringify. */
function jsonCharBytes(cp: number): number {
  if (cp === 0x22 || cp === 0x5c) return 2; // \" \
  if (cp < 0x20) return cp === 0x08 || cp === 0x09 || cp === 0x0a || cp === 0x0c || cp === 0x0d ? 2 : 6;
  if (cp >= 0xd800 && cp <= 0xdfff) return 6; // lone surrogate → \udxxx
  if (cp < 0x80) return 1;
  if (cp < 0x800) return 2;
  if (cp < 0x10000) return 3;
  return 4;
}

/** Split `json` into slices whose JSON-escaped size is at most `budget`; never splits a code point. */
function slices(json: string, budget: number): string[] {
  const out: string[] = [];
  let start = 0;
  let size = 0;
  let i = 0;
  while (i < json.length) {
    const cp = json.codePointAt(i)!;
    const width = cp > 0xffff ? 2 : 1;
    const cost = jsonCharBytes(cp);
    if (size + cost > budget) {
      out.push(json.slice(start, i));
      start = i;
      size = 0;
    }
    size += cost;
    i += width;
  }
  out.push(json.slice(start));
  return out;
}

/**
 * `[msg]` when its JSON fits in `MAX_OUTGOING_JSON_BYTES`; otherwise `chunk` messages whose own
 * JSON each fits, carrying slices of the original JSON string and the original `requestId`.
 */
export function chunkMessage(msg: HostToExt): HostToExt[] {
  const json = JSON.stringify(msg);
  if (Buffer.byteLength(json, "utf8") <= MAX_OUTGOING_JSON_BYTES) return [msg];
  const messageId = randomUUID();
  const requestId = "requestId" in msg ? msg.requestId : undefined;
  // Envelope size with the widest index/count a chunk can have and empty data.
  const shell: Chunk = {
    type: "chunk",
    ...(requestId !== undefined ? { requestId } : {}),
    messageId,
    index: Number.MAX_SAFE_INTEGER,
    count: Number.MAX_SAFE_INTEGER,
    data: "",
  };
  const budget = MAX_OUTGOING_JSON_BYTES - Buffer.byteLength(JSON.stringify(shell), "utf8");
  const parts = slices(json, budget);
  return parts.map((data, index) => ({ ...shell, index, count: parts.length, data }));
}

export type ReassembleResult =
  | { ok: true; message: unknown }
  | { ok: false; error: { code: "incomplete" | "inconsistent" | "invalid_json" } };

/** Join the chunks of one `messageId` (any order) and parse the JSON. */
export function reassemble(chunks: Chunk[]): ReassembleResult {
  const first = chunks[0];
  if (first === undefined) return { ok: false, error: { code: "incomplete" } };
  const byIndex = new Map<number, string>();
  for (const c of chunks) {
    if (c.messageId !== first.messageId || c.count !== first.count || c.index >= c.count) {
      return { ok: false, error: { code: "inconsistent" } };
    }
    if (byIndex.has(c.index)) return { ok: false, error: { code: "inconsistent" } };
    byIndex.set(c.index, c.data);
  }
  if (byIndex.size !== first.count) return { ok: false, error: { code: "incomplete" } };
  let json = "";
  for (let i = 0; i < first.count; i++) json += byIndex.get(i)!;
  try {
    return { ok: true, message: JSON.parse(json) };
  } catch {
    return { ok: false, error: { code: "invalid_json" } };
  }
}
