import { describe, expect, it } from "vitest";

describe("@cb/compiler", () => {
  it("T00 @cb/compiler builds", async () => {
    const mod: unknown = await import("../src/index.js");
    expect(mod).toBeTypeOf("object");
  });
});
