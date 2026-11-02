// T05 row 7: bundle zip contents (AC-17).
import type { ContextPack } from "@cb/schema";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildBundle } from "../src/bundle.js";
import { compile } from "../src/compile.js";
import { destination, input } from "./helpers.js";

describe("buildBundle", () => {
  it("AC-17 bundle contents", async () => {
    const result = await compile(input({ destination: destination(2000, "bundle", "rescue") }));
    if (!result.ok) throw new Error("compile failed");
    // T05 pushes no attachments itself; add one pushed file as T16 will.
    const pack: ContextPack = {
      ...result.pack,
      push: {
        ...result.pack.push,
        attachments: [{ id: "a001", as: "file", name: "diagram.png", mime: "image/png" }],
      },
    };
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10]);
    const zip = buildBundle(pack, result.envelope, new Map([["a001", bytes]]));
    const entries = unzipSync(zip);

    expect(Object.keys(entries).sort()).toEqual([
      "files/a001-diagram.png",
      "manifest.json",
      "pack.md",
    ]);
    expect(strFromU8(entries["pack.md"] ?? new Uint8Array())).toBe(result.envelope);
    expect(entries["files/a001-diagram.png"]).toEqual(bytes);

    const manifest: unknown = JSON.parse(strFromU8(entries["manifest.json"] ?? new Uint8Array()));
    expect(manifest).toMatchObject({
      manifest: pack.push.manifest,
      attachments: pack.push.attachments,
    });
    // No transcript inside.
    expect(Object.keys(entries).some((n) => /transcript/i.test(n))).toBe(false);
  });
});
