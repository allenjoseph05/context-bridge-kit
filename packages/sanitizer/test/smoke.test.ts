import { describe, expect, it } from "vitest";

describe("@cb/sanitizer", () => {
  it("T00 @cb/sanitizer builds", async () => {
    const mod: unknown = await import("../src/index.js");
    expect(mod).toBeTypeOf("object");
  });
});
