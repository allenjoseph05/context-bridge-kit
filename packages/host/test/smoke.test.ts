import { describe, expect, it } from "vitest";

describe("@cb/host", () => {
  it("T00 @cb/host builds", async () => {
    const mod: unknown = await import("../src/index.js");
    expect(mod).toBeTypeOf("object");
  });
});
