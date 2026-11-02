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

    for (const [make, re] of [
      [newPackId, PACK_ID],
      [newSessionId, SESSION_ID],
      [newPreviewId, PREVIEW_ID],
    ] as const) {
      const seen = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        const id = make();
        expect(re.test(id)).toBe(true);
        seen.add(id);
      }
      expect(seen.size).toBe(1000);
    }
  });
});
