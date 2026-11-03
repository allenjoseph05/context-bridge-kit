import { endianness } from "node:os";
import { describe, expect, it } from "vitest";
import { createDecoder, encode, MAX_INCOMING_BYTES } from "../src/framing.js";
import type { DecodeError } from "../src/framing.js";

const MESSAGES: unknown[] = [
  { type: "hello", requestId: "r1", protocol: 1 },
  { type: "ingest", requestId: "r2", text: "Grüße — 日本語 — 🙂 \"quoted\" \\ back" },
  { type: "list_packs", requestId: "r3" },
];

function decodeAll(chunks: Uint8Array[]): { msgs: unknown[]; errors: DecodeError[] } {
  const msgs: unknown[] = [];
  const errors: DecodeError[] = [];
  const d = createDecoder(
    (m) => msgs.push(m),
    (e) => errors.push(e),
  );
  for (const c of chunks) d.push(c);
  return { msgs, errors };
}

describe("framing", () => {
  it("T07 framing", () => {
    const frames = MESSAGES.map((m) => encode(m));

    // Header: 4-byte length in native byte order, then UTF-8 JSON.
    for (const [i, f] of frames.entries()) {
      const len = endianness() === "LE" ? f.readUInt32LE(0) : f.readUInt32BE(0);
      expect(len).toBe(f.length - 4);
      expect(JSON.parse(f.subarray(4).toString("utf8"))).toEqual(MESSAGES[i]);
    }

    const all = Buffer.concat(frames);

    // Several messages in one read.
    expect(decodeAll([all]).msgs).toEqual(MESSAGES);

    // One byte per read (splits inside headers and inside multi-byte UTF-8 sequences).
    expect(decodeAll([...all].map((b) => Uint8Array.of(b))).msgs).toEqual(MESSAGES);

    // Every two-way split point.
    for (let cut = 0; cut <= all.length; cut++) {
      const { msgs, errors } = decodeAll([all.subarray(0, cut), all.subarray(cut)]);
      expect(msgs).toEqual(MESSAGES);
      expect(errors).toEqual([]);
    }
  });

  it("T07 framing invalid JSON reports an error and decoding continues", () => {
    const bad = Buffer.from("{not json", "utf8");
    const header = Buffer.alloc(4);
    if (endianness() === "LE") header.writeUInt32LE(bad.length);
    else header.writeUInt32BE(bad.length);
    const { msgs, errors } = decodeAll([Buffer.concat([header, bad, encode(MESSAGES[0])])]);
    expect(errors).toEqual([{ kind: "invalid_json" }]);
    expect(msgs).toEqual([MESSAGES[0]]);
  });

  it("T07 framing oversize frame is skipped without buffering it", () => {
    const size = MAX_INCOMING_BYTES + 1;
    const header = Buffer.alloc(4);
    if (endianness() === "LE") header.writeUInt32LE(size);
    else header.writeUInt32BE(size);

    const msgs: unknown[] = [];
    const errors: DecodeError[] = [];
    const d = createDecoder(
      (m) => msgs.push(m),
      (e) => errors.push(e),
    );

    d.push(header);
    // Reported as soon as the header is read, before any body byte arrives.
    expect(errors).toEqual([{ kind: "too_large", bytes: size }]);

    const block = Buffer.alloc(1024 * 1024, 0x61);
    let left = size;
    let maxHeld = 0;
    while (left > 0) {
      const n = Math.min(left, block.length);
      d.push(block.subarray(0, n));
      left -= n;
      maxHeld = Math.max(maxHeld, d.buffered());
    }
    expect(maxHeld).toBe(0);

    // The next frame decodes normally.
    d.push(encode(MESSAGES[2]));
    expect(msgs).toEqual([MESSAGES[2]]);
    expect(errors).toHaveLength(1);
  });

  it("T07 framing accepts a frame of exactly the limit length header", () => {
    const header = Buffer.alloc(4);
    if (endianness() === "LE") header.writeUInt32LE(MAX_INCOMING_BYTES);
    else header.writeUInt32BE(MAX_INCOMING_BYTES);
    const errors: DecodeError[] = [];
    const d = createDecoder(
      () => undefined,
      (e) => errors.push(e),
    );
    d.push(header);
    expect(errors).toEqual([]);
  });
});
