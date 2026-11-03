// T06 rows 3, 4, 9: expiry with a fake clock, user delete, orphan files and stale cache.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openVault } from "../src/index.js";
import type { Vault } from "../src/index.js";
import { auditLines, buildPack, DAY, fakeClock, HOUR, INDEX, T0, tempDir } from "./helpers.js";

const A = "cp_aaaaaaaa";
const B = "cp_bbbbbbbb";
const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

function packPaths(root: string, id: string): string[] {
  return [
    join(root, "packs", `${id}.json`),
    join(root, "packs", `${id}.envelope.txt`),
    join(root, "transcripts", `${id}.json`),
    join(root, "index", `${id}.json`),
  ];
}

/** Pack A (created T0) references f1 and f2; pack B (created T0 + 3 days) references f2. */
async function twoPacks(): Promise<{ root: string; vault: Vault; clock: ReturnType<typeof fakeClock>; f1: string; f2: string }> {
  const root = join(tempDir(), "vault");
  const clock = fakeClock(T0);
  const vault = openVault({ root, now: clock.now });
  const f1 = vault.putFile(bytes("synthetic file one"));
  const f2 = vault.putFile(bytes("synthetic file two"));
  expect(vault.putText(f1, "text of one").ok).toBe(true);
  expect(vault.putText(f2, "text of two").ok).toBe(true);
  const a = await buildPack(A, { createdAt: T0, fileShas: [f1, f2] });
  const b = await buildPack(B, { createdAt: new Date(T0.getTime() + 3 * DAY), fileShas: [f2] });
  expect(vault.writePack(a.pack, a.envelope, a.transcript, INDEX).ok).toBe(true);
  expect(vault.writePack(b.pack, b.envelope, b.transcript, INDEX).ok).toBe(true);
  return { root, vault, clock, f1, f2 };
}

describe("expiry and deletion", () => {
  it("AC-21 expiry with fake clock", async () => {
    const { root, vault, clock, f1, f2 } = await twoPacks();
    expect(vault.listPacks().map((m) => m.id).sort()).toEqual([A, B]);

    // Just before A's expiry nothing changes.
    clock.set(new Date(T0.getTime() + 7 * DAY - 1000));
    expect(vault.sweepExpired().packs).toEqual([]);
    expect(vault.listPacks().map((m) => m.id).sort()).toEqual([A, B]);

    // Past A's expiry: A is no longer listed, even before a sweep.
    clock.set(new Date(T0.getTime() + 7 * DAY + 60_000));
    expect(vault.listPacks().map((m) => m.id)).toEqual([B]);

    const report = vault.sweepExpired();
    expect(report.packs).toEqual([A]);
    for (const p of packPaths(root, A)) expect(existsSync(p), p).toBe(false);
    for (const p of packPaths(root, B)) expect(existsSync(p), p).toBe(true);
    // f1 was referenced only by A: bytes and text gone. f2 is still referenced by B.
    expect(existsSync(join(root, "files", f1))).toBe(false);
    expect(existsSync(join(root, "files", `${f1}.txt`))).toBe(false);
    expect(vault.getFile(f1)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(vault.getFile(f2)).toEqual({ ok: true, value: bytes("synthetic file two") });
    expect(vault.getText(f2)).toEqual({ ok: true, value: "text of two" });
    expect(vault.readPack(A)).toEqual({ ok: false, error: { code: "not_found" } });

    const expired = auditLines(root).filter((l) => l.event === "expired");
    expect(expired.some((l) => l.packId === A)).toBe(true);
    expect(expired.some((l) => l.packId === B)).toBe(false);

    // A second sweep finds nothing more.
    expect(vault.sweepExpired()).toEqual({ packs: [], files: 0, cache: 0 });
  });

  it("AC-21 user delete", async () => {
    const { root, vault, f1, f2 } = await twoPacks();
    expect(vault.deletePack(A)).toEqual({ ok: true, value: undefined });

    for (const p of packPaths(root, A)) expect(existsSync(p), p).toBe(false);
    for (const p of packPaths(root, B)) expect(existsSync(p), p).toBe(true);
    expect(existsSync(join(root, "files", f1))).toBe(false);
    expect(existsSync(join(root, "files", `${f1}.txt`))).toBe(false);
    expect(existsSync(join(root, "files", f2))).toBe(true);
    expect(existsSync(join(root, "files", `${f2}.txt`))).toBe(true);
    expect(vault.listPacks().map((m) => m.id)).toEqual([B]);

    const deleted = auditLines(root).filter((l) => l.event === "deleted");
    expect(deleted).toHaveLength(1);
    expect(deleted[0]!.packId).toBe(A);

    // Deleting again is a typed not_found, and B's deletion now frees f2.
    expect(vault.deletePack(A)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(vault.deletePack(B).ok).toBe(true);
    expect(existsSync(join(root, "files", f2))).toBe(false);
    expect(auditLines(root).filter((l) => l.event === "deleted").map((l) => l.packId)).toEqual([A, B]);
    expect(readFileSync(join(root, "audit.jsonl"), "utf8")).not.toContain("synthetic-");
  });

  it("T06 orphan files and stale cache", async () => {
    const root = join(tempDir(), "vault");
    const clock = fakeClock(new Date(T0.getTime() - 30 * HOUR));
    const vault = openVault({ root, now: clock.now });

    // 30 h before T0: an orphan that will be old, and a file a live pack references.
    const old = vault.putFile(bytes("old orphan"));
    expect(vault.putText(old, "old orphan text").ok).toBe(true);
    const referenced = vault.putFile(bytes("referenced"));
    const refreshed = vault.putFile(bytes("refreshed later"));
    // Cache entries: one 8 days old at T0 (stale), one 6 days old (fresh). expiryDays defaults to 7.
    clock.set(new Date(T0.getTime() - 8 * DAY));
    expect(vault.cachePut("stale_key", { v: 1 }).ok).toBe(true);
    clock.set(new Date(T0.getTime() - 6 * DAY));
    expect(vault.cachePut("fresh_key", { v: 2 }).ok).toBe(true);

    // 1 h before T0: a young orphan; re-putting existing bytes refreshes their age.
    clock.set(new Date(T0.getTime() - HOUR));
    const young = vault.putFile(bytes("young orphan"));
    expect(vault.putFile(bytes("refreshed later"))).toBe(refreshed);

    clock.set(T0);
    const p = await buildPack(A, { createdAt: T0, fileShas: [referenced] });
    expect(vault.writePack(p.pack, p.envelope, p.transcript, INDEX).ok).toBe(true);

    const report = vault.sweepExpired();
    expect(report).toEqual({ packs: [], files: 2, cache: 1 });
    expect(existsSync(join(root, "files", old))).toBe(false);
    expect(existsSync(join(root, "files", `${old}.txt`))).toBe(false);
    for (const sha of [referenced, refreshed, young]) {
      expect(vault.getFile(sha).ok, sha).toBe(true);
    }
    expect(vault.cacheGet("stale_key")).toEqual({ ok: false, error: { code: "not_found" } });
    expect(vault.cacheGet("fresh_key")).toEqual({ ok: true, value: { v: 2 } });
    expect(vault.listPacks().map((m) => m.id)).toEqual([A]);

    // Each deletion audited as expired, without content: no cache key, no text.
    const expired = auditLines(root).filter((l) => l.event === "expired");
    expect(expired).toHaveLength(3);
    expect(expired.filter((l) => l.sha256 === old)).toHaveLength(2);
    const log = readFileSync(join(root, "audit.jsonl"), "utf8");
    expect(log).not.toContain("stale_key");
    expect(log).not.toContain("orphan");

    // A later sweep, 25 h after the young orphan was put, removes it too.
    clock.set(new Date(T0.getTime() + 24 * HOUR));
    expect(vault.sweepExpired()).toEqual({ packs: [], files: 2, cache: 0 });
    expect(vault.getFile(young).ok).toBe(false);
    expect(vault.getFile(refreshed).ok).toBe(false);
    expect(vault.getFile(referenced).ok).toBe(true);
  });
});
