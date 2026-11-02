import { describe, expect, it } from "vitest";

describe("@cb/attachments", () => {
  it("T00 @cb/attachments builds", async () => {
    const mod: unknown = await import("../src/index.js");
    expect(mod).toBeTypeOf("object");
  });
});
