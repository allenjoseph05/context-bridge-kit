import { describe, expect, it } from "vitest";

describe("@cb/index", () => {
  it("T00 @cb/index builds", async () => {
    const mod: unknown = await import("../src/index.js");
    expect(mod).toBeTypeOf("object");
  });
});
