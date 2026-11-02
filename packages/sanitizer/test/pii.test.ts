// T03 row 7: personal data (sanitizer.md §Steps 4). Test numbers only (published examples).
import { describe, expect, it } from "vitest";
import { createContext, sanitizeText } from "../src/index.js";

describe("personal data", () => {
  it("AC-05 checksum-validated pii", () => {
    const ctx = createContext();
    const text = [
      "Pay to GB82WEST12345698765432 or DE89 3704 0044 0532 0130 00.",
      "Cards: 4111111111111111, 5500-0000-0000-0004 and 4012 8888 8888 1881.",
      "Look-alikes: GB82WEST12345698765431, DE89 3704 0044 0532 0130 01, 4111111111111112, 4111 1111 1111 1112.",
    ].join("\n");
    expect(sanitizeText(text, ctx).text).toBe(
      [
        "Pay to [IBAN_1] or [IBAN_2].",
        "Cards: [CARD_1], [CARD_2] and [CARD_3].",
        "Look-alikes: GB82WEST12345698765431, DE89 3704 0044 0532 0130 01, 4111111111111112, 4111 1111 1111 1112.",
      ].join("\n"),
    );
    expect([...ctx.redactions.values()].map((r) => [r.placeholder, r.kind, r.value])).toEqual([
      ["[IBAN_1]", "iban", "GB82WEST12345698765432"],
      ["[IBAN_2]", "iban", "DE89 3704 0044 0532 0130 00"],
      ["[CARD_1]", "card", "4111111111111111"],
      ["[CARD_2]", "card", "5500-0000-0000-0004"],
      ["[CARD_3]", "card", "4012 8888 8888 1881"],
    ]);
  });

  it("AC-05 emails and phone numbers", () => {
    const ctx = createContext();
    expect(
      sanitizeText(
        "Mail jane.doe@example.com or call +49 30 1234567 or 030 12345678, or +14155550123.",
        ctx,
      ).text,
    ).toBe("Mail [EMAIL_1] or call [PHONE_1] or [PHONE_2], or [PHONE_3].");

    // Ordinary numbers, dates and a host without a TLD are not personal data.
    const plain =
      "Order 12345 shipped on 2026-11-02 at 10:00, costs 1,250.00; DATABASE_URL=postgres://app@localhost:5432/tasks";
    const c2 = createContext();
    expect(sanitizeText(plain, c2).text).toBe(plain);
    expect(c2.redactions.size).toBe(0);
  });
});
