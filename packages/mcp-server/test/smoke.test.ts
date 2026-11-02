import { describe, expect, it } from "vitest";

describe("@cb/mcp-server", () => {
  it("T00 @cb/mcp-server builds", async () => {
    const mod: unknown = await import("../src/index.js");
    expect(mod).toBeTypeOf("object");
  });
});
