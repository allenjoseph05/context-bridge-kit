import { describe, expect, it } from "vitest";

describe("@cb/tokens", () => {
  it("T00 @cb/tokens builds", async () => {
    const mod: unknown = await import("../src/index.js");
    expect(mod).toBeTypeOf("object");
  });
});
