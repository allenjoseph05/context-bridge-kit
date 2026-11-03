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

/** One framed message: length header in `os.endianness()` order, then the JSON bytes. */
export function encode(obj: unknown): Buffer {
  void endianness;
  void obj;
  throw new Error("not implemented (T07)");
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
  void onMessage;
  void onError;
  throw new Error("not implemented (T07)");
}
