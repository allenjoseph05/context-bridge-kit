// Host side of transport-level chunking (protocol.md §Framing). The pure split and reassembly
// live in @cb/schema, shared with the extension; the host only supplies a random messageId.
import { randomUUID } from "node:crypto";
import { splitIntoChunks, type HostToExt } from "@cb/schema";

export { MAX_OUTGOING_JSON_BYTES, reassemble, type ReassembleResult } from "@cb/schema";

/**
 * `[msg]` when its JSON fits in `MAX_OUTGOING_JSON_BYTES`; otherwise `chunk` messages whose own
 * JSON each fits, carrying slices of the original JSON string and the original `requestId`.
 */
export function chunkMessage(msg: HostToExt): HostToExt[] {
  return splitIntoChunks(msg, randomUUID());
}
