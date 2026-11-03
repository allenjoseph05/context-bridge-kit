// Pack id collision guard: the vault never overwrites an existing pack.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openVault } from "../src/index.js";
import { buildPack, INDEX, tempDir } from "./helpers.js";

const ID = "cp_0a1b2c3d";

describe("vault pack ids", () => {
  it("fix writePack never overwrites an existing pack", async () => {
    const root = join(tempDir(), "vault");
    const vault = openVault({ root });
    expect(vault.hasPack(ID)).toBe(false);
    const first = await buildPack(ID);
    expect(vault.writePack(first.pack, first.envelope, first.transcript, INDEX).ok).toBe(true);
    expect(vault.hasPack(ID)).toBe(true);

    const before = readFileSync(join(root, "packs", `${ID}.envelope.txt`), "utf8");
    const second = await buildPack(ID);
    const other = `${second.envelope}\nA different envelope.`;
    expect(vault.writePack(second.pack, other, second.transcript, { other: true })).toEqual({
      ok: false,
      error: { code: "exists" },
    });
    expect(readFileSync(join(root, "packs", `${ID}.envelope.txt`), "utf8")).toBe(before);
    expect(vault.readIndex(ID)).toEqual({ ok: true, value: INDEX });

    // After deletion the id is free again.
    expect(vault.deletePack(ID).ok).toBe(true);
    expect(vault.hasPack(ID)).toBe(false);
    // Invalid ids are never looked up on disk.
    expect(vault.hasPack("../cp_0a1b2c3d")).toBe(false);
  });
});
