import { describe, expect, it } from "vitest";

describe("@cb/extension", () => {
  it("T00 @cb/extension builds", async () => {
    const mod: unknown = await import("../src/index.js");
    expect(mod).toBeTypeOf("object");
  });
});
