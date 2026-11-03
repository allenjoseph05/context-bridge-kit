import { Chunk, HostToExt } from "@cb/schema";
import { describe, expect, it } from "vitest";
import { chunkMessage, MAX_OUTGOING_JSON_BYTES, reassemble } from "../src/chunking.js";

/** A ~3 MB preview whose envelope mixes ASCII, quotes, backslashes, control chars and non-BMP text. */
function bigPreview(): Extract<HostToExt, { type: "preview" }> {
  const unit = 'line "quoted" \\ back\ttab\u0001 Grüße 日本語 🙂\n';
  const envelope = unit.repeat(Math.ceil(3_000_000 / Buffer.byteLength(unit, "utf8")));
  return {
    type: "preview",
    requestId: "req-big",
    sessionId: "s_0b7e11c3",
    previewId: "p_44aa0912",
    hash: "a".repeat(64),
    envelope,
    images: [],
    flags: [],
    cutList: [],
    notices: [],
    stats: { capturedTokens: 1, pushedTokens: 1, budget: 6800, cutCount: 0 },
  };
}

const bytes = (m: unknown): number => Buffer.byteLength(JSON.stringify(m), "utf8");

describe("chunking", () => {
  it("T07 chunking", () => {
    const msg = bigPreview();
    expect(bytes(msg)).toBeGreaterThan(3_000_000);

    const parts = chunkMessage(msg);
    expect(parts.length).toBeGreaterThanOrEqual(4);

    const chunks = parts.map((p) => Chunk.parse(p));
    const messageId = chunks[0]!.messageId;
    chunks.forEach((c, i) => {
      expect(bytes(c)).toBeLessThanOrEqual(MAX_OUTGOING_JSON_BYTES);
      expect(HostToExt.safeParse(c).success).toBe(true);
      expect(c.messageId).toBe(messageId);
      expect(c.index).toBe(i);
      expect(c.count).toBe(chunks.length);
      expect(c.requestId).toBe("req-big");
    });

    // Reassembles to the original, in any order.
    expect(reassemble(chunks)).toEqual({ ok: true, message: msg });
    expect(reassemble([...chunks].reverse())).toEqual({ ok: true, message: msg });
  });

  it("T07 chunking leaves small messages alone", () => {
    const msg: HostToExt = { type: "deleted", requestId: "r1", packId: "cp_9f2c41ab" };
    expect(chunkMessage(msg)).toEqual([msg]);
  });

  it("T07 chunking reassemble reports missing chunks", () => {
    const chunks = chunkMessage(bigPreview()).map((p) => Chunk.parse(p));
    expect(reassemble(chunks.slice(1))).toEqual({ ok: false, error: { code: "incomplete" } });
  });
});
