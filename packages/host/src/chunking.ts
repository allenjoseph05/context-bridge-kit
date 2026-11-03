// Transport-level chunking of host → extension messages (protocol.md §Framing).
import type { Chunk, HostToExt } from "@cb/schema";

/** Host → extension messages whose JSON exceeds this many bytes are split into `chunk` messages. */
export const MAX_OUTGOING_JSON_BYTES = 900_000;

/**
 * `[msg]` when its JSON fits in `MAX_OUTGOING_JSON_BYTES`; otherwise `chunk` messages whose own
 * JSON each fits, carrying slices of the original JSON string and the original `requestId`.
 */
export function chunkMessage(msg: HostToExt): HostToExt[] {
  void msg;
  throw new Error("not implemented (T07)");
}

export type ReassembleResult =
  | { ok: true; message: unknown }
  | { ok: false; error: { code: "incomplete" | "inconsistent" | "invalid_json" } };

/** Join the chunks of one `messageId` (any order) and parse the JSON. */
export function reassemble(chunks: Chunk[]): ReassembleResult {
  void chunks;
  throw new Error("not implemented (T07)");
}
