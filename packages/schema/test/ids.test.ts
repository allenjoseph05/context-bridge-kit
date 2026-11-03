import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_ID,
  ITEM_ID,
  PACK_ID,
  PREVIEW_ID,
  SESSION_ID,
  TURN_ID,
  attachmentId,
  itemId,
  newPackId,
  newPreviewId,
  newSessionId,
  turnId,
} from "../src/index.js";
import type { IdRng } from "../src/index.js";

/** Deterministic RNG: the i-th call returns `i` as big-endian bytes, so every draw differs. */
function counterRng(): IdRng {
  let i = 0;
  return (n) => {
    const out = new Uint8Array(n);
    let v = i++;
    for (let j = n - 1; j >= 0; j--) {
      out[j] = v & 0xff;
      v = Math.floor(v / 256);
    }
    return out;
  };
}

describe("@cb/schema ids", () => {
  it("T01 ids", () => {
    expect(turnId(7)).toBe("t007");
    expect(attachmentId(2)).toBe("a002");
    expect(itemId(14)).toBe("i014");
    expect(TURN_ID.test(turnId(1))).toBe(true);
    expect(ATTACHMENT_ID.test(attachmentId(999))).toBe(true);
    expect(ITEM_ID.test(itemId(42))).toBe(true);
    expect(TURN_ID.test("t07")).toBe(false);
    expect(PACK_ID.test("cp_9F2C41AB")).toBe(false);

    for (const [make, re, prefix] of [
      [newPackId, PACK_ID, "cp_"],
      [newSessionId, SESSION_ID, "s_"],
      [newPreviewId, PREVIEW_ID, "p_"],
    ] as const) {
      // Format and uniqueness with an injected deterministic RNG: cannot fail by chance.
      const rng = counterRng();
      const seen = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        const id = make(rng);
        expect(re.test(id), id).toBe(true);
        seen.add(id);
      }
      expect(seen.size).toBe(1000);

      // The id is exactly the RNG's bytes in lowercase hex.
      expect(make(() => new Uint8Array([0x00, 0x0f, 0xa0, 0xff]))).toBe(`${prefix}000fa0ff`);
      // Same bytes, same id: the RNG is really used.
      expect(make(() => new Uint8Array([1, 2, 3, 4]))).toBe(make(() => new Uint8Array([1, 2, 3, 4])));

      // The default (crypto) RNG gives the right format; uniqueness is not asserted (random).
      for (let i = 0; i < 20; i++) expect(re.test(make())).toBe(true);
    }
  });
});
