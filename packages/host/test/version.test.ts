import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { harness, only } from "./helpers.js";

describe("hello version", () => {
  it("T08 hostVersion comes from the host's package.json", async () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    expect(pkg.version).toBe("0.1.0");
    const h = harness();
    const r = only(await h.sendRaw({ type: "hello", requestId: "r-v", protocol: 1 }), "hello_ok");
    expect(r.hostVersion).toBe(pkg.version);
  });
});
