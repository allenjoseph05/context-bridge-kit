import { describe, expect, it } from "vitest";

describe("@cb/extractor", () => {
  it("T00 @cb/extractor builds", async () => {
    const mod: unknown = await import("../src/index.js");
    expect(mod).toBeTypeOf("object");
  });
});
