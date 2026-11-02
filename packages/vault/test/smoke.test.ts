import { describe, expect, it } from "vitest";

describe("@cb/vault", () => {
  it("T00 @cb/vault builds", async () => {
    const mod: unknown = await import("../src/index.js");
    expect(mod).toBeTypeOf("object");
  });
});
