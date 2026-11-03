import { describe, expect, it } from "vitest";
import { PackRedaction } from "../src/index.js";

describe("PackRedaction", () => {
  it("AC-05 pack redactions mark revealed values but never carry a value", () => {
    expect(PackRedaction.safeParse({ placeholder: "[EMAIL_1]", kind: "email" }).success).toBe(true);
    expect(
      PackRedaction.safeParse({ placeholder: "[EMAIL_1]", kind: "email", revealed: true }).success,
    ).toBe(true);
    expect(
      PackRedaction.safeParse({ placeholder: "[EMAIL_1]", kind: "email", revealed: false }).success,
    ).toBe(false);
    expect(
      PackRedaction.safeParse({ placeholder: "[EMAIL_1]", kind: "email", value: "jane.doe@example.com" })
        .success,
    ).toBe(false);
  });
});
