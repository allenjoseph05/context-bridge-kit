import { describe, expect, it } from "vitest";

describe("@cb/adapters", () => {
  it("T00 @cb/adapters builds", async () => {
    const mod: unknown = await import("../src/index.js");
    expect(mod).toBeTypeOf("object");
  });
});
