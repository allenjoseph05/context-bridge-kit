// Native messaging framing (protocol.md §Framing): 4-byte length in native byte order + UTF-8 JSON.
import { endianness } from "node:os";

/** Chrome's limit for extension → host messages; a larger declared length is refused. */
export const MAX_INCOMING_BYTES = 64 * 1024 * 1024;

export type DecodeError = { kind: "invalid_json" } | { kind: "too_large"; bytes: number };

export type Decoder = {
  /** Feed bytes as they arrive from stdin; any split, any number of messages per chunk. */
  push(chunk: Uint8Array): void;
  /** Bytes currently held while waiting for the rest of a frame. */
  buffered(): number;
};

const LITTLE = endianness() === "LE";

function readLength(b: Buffer): number {
  return LITTLE ? b.readUInt32LE(0) : b.readUInt32BE(0);
}

/** One framed message: length header in `os.endianness()` order, then the JSON bytes. */
export function encode(obj: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  const frame = Buffer.allocUnsafe(4 + body.length);
  if (LITTLE) frame.writeUInt32LE(body.length, 0);
  else frame.writeUInt32BE(body.length, 0);
  body.copy(frame, 4);
  return frame;
}

/**
 * Stateful decoder. Calls `onMessage` with each parsed JSON value in order. A frame that is not
 * valid JSON, or whose declared length exceeds `MAX_INCOMING_BYTES`, calls `onError` instead; an
 * oversize frame's bytes are skipped as they arrive, never buffered.
 */
export function createDecoder(
  onMessage: (msg: unknown) => void,
  onError?: (error: DecodeError) => void,
): Decoder {
  let held: Buffer[] = [];
  let heldBytes = 0;
  /** Body length of the frame being read, once its header is complete. */
  let need: number | undefined;
  /** Bytes of an oversize frame still to discard. */
  let skip = 0;

  const take = (n: number): Buffer => {
    const all = held.length === 1 ? held[0]! : Buffer.concat(held, heldBytes);
    const out = all.subarray(0, n);
    const rest = all.subarray(n);
    held = rest.length > 0 ? [rest] : [];
    heldBytes = rest.length;
    return out;
  };

  return {
    push(chunk: Uint8Array): void {
      let input = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      for (;;) {
        if (skip > 0) {
          const n = Math.min(skip, input.length);
          skip -= n;
          input = input.subarray(n);
          if (skip > 0) return;
        }
        if (input.length > 0) {
          // Copy: the caller may reuse its buffer after push returns.
          held.push(Buffer.from(input));
          heldBytes += input.length;
          input = Buffer.alloc(0);
        }
        if (need === undefined) {
          if (heldBytes < 4) return;
          const len = readLength(take(4));
          if (len > MAX_INCOMING_BYTES) {
            onError?.({ kind: "too_large", bytes: len });
            // Discard what is already held of this frame, then skip the rest as it arrives.
            const rest = take(heldBytes);
            skip = len;
            input = rest;
            continue;
          }
          need = len;
        }
        if (heldBytes < need) return;
        const body = take(need);
        need = undefined;
        let msg: unknown;
        let ok = true;
        try {
          msg = JSON.parse(body.toString("utf8"));
        } catch {
          ok = false;
        }
        if (ok) onMessage(msg);
        else onError?.({ kind: "invalid_json" });
      }
    },
    buffered(): number {
      return heldBytes;
    },
  };
}
