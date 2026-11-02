import { describe, expect, it } from "vitest";

describe("@cb/schema", () => {
  it("T00 @cb/schema builds", async () => {
    const mod: unknown = await import("../src/index.js");
    expect(mod).toBeTypeOf("object");
  });
});
