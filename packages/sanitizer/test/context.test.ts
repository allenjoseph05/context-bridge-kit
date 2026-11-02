// T03 rows 8–9: placeholders and unredact (sanitizer.md §Placeholders). Synthetic values only.
import { describe, expect, it } from "vitest";
import { createContext, sanitizeText, unredact } from "../src/index.js";

const AWS = "AKIAZZZZEXAMPLE12345";

describe("sanitize context", () => {
  it("AC-05 stable placeholders", () => {
    const ctx = createContext();
    expect(
      sanitizeText(`a@example.com, b@example.org and a@example.com; key ${AWS}`, ctx).text,
    ).toBe("[EMAIL_1], [EMAIL_2] and [EMAIL_1]; key [SECRET_1]");
    // Same context, later call: known values reuse their placeholder, numbering continues per kind.
    expect(sanitizeText(`b@example.org again, c@example.net, ${AWS}`, ctx).text).toBe(
      "[EMAIL_2] again, [EMAIL_3], [SECRET_1]",
    );
    expect(ctx.redactions.get("a@example.com")).toEqual({
      placeholder: "[EMAIL_1]",
      kind: "email",
      value: "a@example.com",
    });
    expect(ctx.redactions.size).toBe(4);
    // A new context (new session) starts again at 1.
    expect(sanitizeText("c@example.net", createContext()).text).toBe("[EMAIL_1]");
  });

  it("AC-05 unredact", () => {
    const ctx = createContext();
    const out = sanitizeText(`a@example.com, b@example.org and a@example.com; key ${AWS}`, ctx).text;

    expect(unredact(out, ["[EMAIL_2]"], ctx)).toBe(
      "[EMAIL_1], b@example.org and [EMAIL_1]; key [SECRET_1]",
    );
    expect(unredact(out, ["[EMAIL_1]", "[SECRET_1]"], ctx)).toBe(
      `a@example.com, [EMAIL_2] and a@example.com; key ${AWS}`,
    );
    // Unknown placeholders and an empty list change nothing.
    expect(unredact(out, ["[EMAIL_9]", "[PHONE_1]"], ctx)).toBe(out);
    expect(unredact(out, [], ctx)).toBe(out);

    // [EMAIL_1] does not touch [EMAIL_10].
    const many = createContext();
    const emails = Array.from({ length: 10 }, (_, i) => `u${i + 1}@example.com`);
    const ten = sanitizeText(emails.join(" "), many).text;
    expect(ten.split(" ").at(-1)).toBe("[EMAIL_10]");
    expect(unredact(ten, ["[EMAIL_1]"], many)).toBe(
      ["u1@example.com", ...ten.split(" ").slice(1)].join(" "),
    );
  });
});
