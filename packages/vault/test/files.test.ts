// T06 row 5: content-addressed files.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { sha256Hex } from "@cb/schema/node";
import { describe, expect, it } from "vitest";
import { openVault } from "../src/index.js";
import { tempDir } from "./helpers.js";

describe("files", () => {
  it("T06 content addressed", () => {
    const root = join(tempDir(), "vault");
    const vault = openVault({ root });
    const data = new TextEncoder().encode("synthetic attachment bytes");

    const sha = vault.putFile(data);
    expect(sha).toBe(sha256Hex(data));
    expect(vault.putFile(new TextEncoder().encode("synthetic attachment bytes"))).toBe(sha);
    expect(readdirSync(join(root, "files"))).toEqual([sha]);
    expect(vault.getFile(sha)).toEqual({ ok: true, value: data });

    const other = vault.putFile(new Uint8Array([0, 255, 7]));
    expect(other).not.toBe(sha);
    expect(readdirSync(join(root, "files")).sort()).toEqual([sha, other].sort());
    expect(vault.getFile(other)).toEqual({ ok: true, value: new Uint8Array([0, 255, 7]) });
  });
});
