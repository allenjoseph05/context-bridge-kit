// T06 rows 1, 2, 8, 10: round trip, permissions, atomic writes, path traversal.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openVault } from "../src/index.js";
import type { VaultOptions } from "../src/index.js";
import { buildPack, INDEX, tempDir, walk } from "./helpers.js";

const ID = "cp_0a1b2c3d";

describe("vault", () => {
  it("T06 round trip", async () => {
    const root = join(tempDir(), "vault");
    const vault = openVault({ root });
    const { pack, envelope, transcript } = await buildPack(ID);
    expect(vault.writePack(pack, envelope, transcript, INDEX)).toEqual({ ok: true, value: undefined });

    expect(vault.readPack(ID)).toEqual({ ok: true, value: pack });
    expect(vault.readTranscript(ID)).toEqual({ ok: true, value: transcript });
    expect(vault.readIndex(ID)).toEqual({ ok: true, value: INDEX });
    const env = vault.readEnvelope(ID);
    expect(env.ok && env.value === envelope).toBe(true);
    // The envelope file holds exactly the approved bytes.
    expect(readFileSync(join(root, "packs", `${ID}.envelope.txt`), "utf8")).toBe(envelope);

    // Layout from host.md §Vault layout.
    for (const p of [`packs/${ID}.json`, `transcripts/${ID}.json`, `index/${ID}.json`]) {
      expect(existsSync(join(root, p)), p).toBe(true);
    }
    expect(vault.listPacks().map((m) => m.id)).toEqual([ID]);

    // Unknown pack: typed not_found.
    expect(vault.readPack("cp_ffffffff")).toEqual({ ok: false, error: { code: "not_found" } });

    // Text, file, cache and config also round trip.
    const sha = vault.putFile(new TextEncoder().encode("synthetic bytes"));
    expect(vault.getFile(sha)).toEqual({ ok: true, value: new TextEncoder().encode("synthetic bytes") });
    expect(vault.putText(sha, "extracted text")).toEqual({ ok: true, value: undefined });
    expect(vault.getText(sha)).toEqual({ ok: true, value: "extracted text" });
    expect(vault.cachePut("k_123", { items: [1, 2] })).toEqual({ ok: true, value: undefined });
    expect(vault.cacheGet("k_123")).toEqual({ ok: true, value: { items: [1, 2] } });
    expect(vault.readConfig().defaults.expiryDays).toBe(7);
    vault.writeConfig({ extensionId: "abcdefghijklmnop", defaults: { expiryDays: 3 } });
    expect(openVault({ root }).readConfig()).toEqual({
      extensionId: "abcdefghijklmnop",
      defaults: { expiryDays: 3 },
    });
  });

  it("T06 root from CB_VAULT", () => {
    const root = join(tempDir(), "from-env");
    const before = process.env.CB_VAULT;
    process.env.CB_VAULT = root;
    try {
      expect(openVault().root).toBe(root);
      expect(existsSync(root)).toBe(true);
    } finally {
      if (before === undefined) delete process.env.CB_VAULT;
      else process.env.CB_VAULT = before;
    }
  });

  // Windows has no POSIX mode bits (Node reports 0o666/0o777 approximations): skipped there.
  it.skipIf(process.platform === "win32")("S15 permissions", async () => {
    const root = join(tempDir(), "vault");
    const vault = openVault({ root });
    const { pack, envelope, transcript } = await buildPack(ID);
    vault.writePack(pack, envelope, transcript, INDEX);
    const sha = vault.putFile(new Uint8Array([1, 2, 3]));
    vault.putText(sha, "text");
    vault.cachePut("key", { a: 1 });
    vault.audit({ event: "approved", packId: ID });
    vault.writeConfig({ defaults: { expiryDays: 7 } });

    const dirs = [root, ...["packs", "transcripts", "index", "files", "cache", "cache/extract"].map((d) => join(root, d))];
    for (const d of dirs) expect(statSync(d).mode & 0o777, d).toBe(0o700);
    const files = walk(root);
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const f of files) expect(statSync(f).mode & 0o777, f).toBe(0o600);
  });

  it("T06 atomic writes", async () => {
    const root = join(tempDir(), "vault");
    const first = await buildPack(ID);
    openVault({ root }).writePack(first.pack, first.envelope, first.transcript, INDEX);
    const before = walk(root).map((f) => [f, readFileSync(f)] as const);

    const crashing = openVault({
      root,
      _testHooks: {
        beforeRename: () => {
          throw new Error("simulated crash");
        },
      },
    } as VaultOptions);
    // A new pack id: packs are never overwritten (writePack refuses with `exists`), so the crash
    // is simulated on a fresh write next to an existing pack.
    const NEW_ID = "cp_ffffffff";
    const second = await buildPack(NEW_ID, { createdAt: new Date("2026-11-03T10:00:00Z") });
    expect(() => crashing.writePack(second.pack, second.envelope, second.transcript, { other: true })).toThrow(
      "simulated crash",
    );

    // Old files intact, byte for byte; nothing new left behind is readable as a pack.
    for (const [f, bytes] of before) expect(readFileSync(f).equals(bytes), f).toBe(true);
    const vault = openVault({ root });
    expect(vault.readPack(ID)).toEqual({ ok: true, value: first.pack });
    expect(vault.readPack(NEW_ID)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(vault.listPacks().map((m) => m.id)).toEqual([ID]);
  });

  it("T06 atomic overwrite of config", () => {
    const root = join(tempDir(), "vault");
    openVault({ root }).writeConfig({ extensionId: "abcdefghijklmnop", defaults: { expiryDays: 3 } });
    const configPath = join(root, "config.json");
    const before = readFileSync(configPath);

    const crashing = openVault({
      root,
      _testHooks: {
        beforeRename: () => {
          throw new Error("simulated crash");
        },
      },
    } as VaultOptions);
    expect(() => crashing.writeConfig({ defaults: { expiryDays: 9 } })).toThrow("simulated crash");

    // The previous config.json is byte-identical and no temp file is left behind.
    expect(readFileSync(configPath).equals(before)).toBe(true);
    expect(readdirSync(root).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    expect(openVault({ root }).readConfig().defaults.expiryDays).toBe(3);
  });

  it("T06 path traversal", async () => {
    const base = tempDir();
    const root = join(base, "vault");
    const vault = openVault({ root });
    // A sentinel outside the vault at every place a traversal could land.
    const outside = join(base, "outside");
    mkdirSync(outside);
    for (const name of ["passwd", "passwd.json", "passwd.txt", "passwd.envelope.txt"]) {
      writeFileSync(join(outside, name), "SENTINEL");
    }
    const listing = (): string[] => readdirSync(outside).sort();
    const before = listing();
    const bad = ["../../etc/passwd", "../outside/passwd", "..\\outside\\passwd", "cp_0a1b2c3d/../x", ""];
    const invalid = { ok: false, error: { code: "invalid_id" } };

    for (const id of bad) {
      expect(vault.readPack(id), `readPack ${id}`).toEqual(invalid);
      expect(vault.readEnvelope(id), `readEnvelope ${id}`).toEqual(invalid);
      expect(vault.readTranscript(id), `readTranscript ${id}`).toEqual(invalid);
      expect(vault.readIndex(id), `readIndex ${id}`).toEqual(invalid);
      expect(vault.deletePack(id), `deletePack ${id}`).toEqual(invalid);
      expect(vault.getFile(id), `getFile ${id}`).toEqual(invalid);
      expect(vault.getText(id), `getText ${id}`).toEqual(invalid);
      expect(vault.putText(id, "x"), `putText ${id}`).toEqual(invalid);
      expect(vault.cacheGet(id), `cacheGet ${id}`).toEqual(invalid);
      expect(vault.cachePut(id, 1), `cachePut ${id}`).toEqual(invalid);
    }
    // Pack ids must match cp_<8 lowercase hex>; shas must be 64 lowercase hex chars.
    expect(vault.readPack("CP_0A1B2C3D")).toEqual(invalid);
    expect(vault.getFile("A".repeat(64))).toEqual(invalid);
    expect(vault.cacheGet("k".repeat(129))).toEqual(invalid);

    // writePack validates the pack id before writing anything.
    const built = await buildPack(ID);
    const evil = { ...built.pack, id: "../outside/passwd" };
    expect(vault.writePack(evil, built.envelope, built.transcript, INDEX)).toEqual(invalid);

    expect(listing()).toEqual(before);
    for (const name of before) expect(readFileSync(join(outside, name), "utf8")).toBe("SENTINEL");
    expect(walk(root).filter((f) => !f.endsWith("audit.jsonl"))).toEqual([]);
  });
});
