// T06 rows 6, 7: audit shape and no secrets on disk.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openVault } from "../src/index.js";
import type { AuditInput } from "../src/index.js";
import { auditLines, buildPack, INDEX, loadFixture, tempDir, walk } from "./helpers.js";

const ID = "cp_5e5e5e5e";

describe("audit", () => {
  it("AC-22 audit shape", () => {
    const root = join(tempDir(), "vault");
    const vault = openVault({ root, now: () => new Date("2026-11-02T10:00:00Z") });
    vault.audit({ event: "approved", sessionId: "s_0b7e11c3", packId: ID, counts: { turns: 9 } });
    vault.audit({ event: "served", packId: ID, tool: "get_turns", route: "mcp" });
    vault.audit({ event: "refused" });

    const lines = readFileSync(join(root, "audit.jsonl"), "utf8").split("\n");
    expect(lines.at(-1)).toBe(""); // newline-terminated
    expect(lines.slice(0, -1)).toHaveLength(3);
    const parsed = auditLines(root);
    for (const l of parsed) {
      expect(typeof l.ts).toBe("string");
      expect(typeof l.event).toBe("string");
    }
    expect(parsed[0]).toEqual({
      ts: "2026-11-02T10:00:00.000Z",
      event: "approved",
      sessionId: "s_0b7e11c3",
      packId: ID,
      counts: { turns: 9 },
    });

    // Fields outside the allowed set are a programming error: a compile error and a throw.
    const extra = { event: "approved", text: "some content" };
    // @ts-expect-error text is not an audit field
    const typed: AuditInput = { event: "approved", text: "some content" };
    expect(typed).toBeDefined();
    expect(() => vault.audit(extra as unknown as AuditInput)).toThrow();
    expect(() => vault.audit({ event: "approved", fileName: "plan.pdf" } as unknown as AuditInput)).toThrow();
    // Values are constrained too: no free text smuggled through allowed fields.
    expect(() => vault.audit({ event: "nope" } as unknown as AuditInput)).toThrow();
    expect(() => vault.audit({ event: "served", tool: "get turns: secret text" })).toThrow();
    expect(() => vault.audit({ event: "served", packId: "not a pack id" })).toThrow();
    expect(() => vault.audit({ event: "served", counts: { "free text key": 1 } })).toThrow();
    expect(auditLines(root)).toHaveLength(3); // rejected events write nothing
  });

  it("AC-05 AC-22 no secrets on disk", async () => {
    const raw = JSON.stringify(loadFixture("small-chat"));
    const planted = ["sk-proj-FAKEFAKEFAKEFAKEFAKE1234", "jane.doe@example.com"];
    for (const s of planted) expect(raw, "fixture still plants the secret").toContain(s);

    const root = join(tempDir(), "vault");
    const vault = openVault({ root });
    const { pack, envelope, transcript } = await buildPack(ID);
    expect(vault.writePack(pack, envelope, transcript, INDEX).ok).toBe(true);
    vault.audit({ event: "approved", packId: ID, counts: { turns: transcript.turns.length } });
    vault.audit({ event: "delivered", packId: ID, route: "clipboard" });
    vault.cachePut("chunk_0001", { items: [] });
    vault.writeConfig({ model: "llama3.1:8b", defaults: { expiryDays: 7 } });
    expect(vault.deletePack(ID).ok).toBe(true);
    // Write it again so pack files are on disk during the scan, alongside the audit log.
    expect(vault.writePack(pack, envelope, transcript, INDEX).ok).toBe(true);

    const files = walk(root);
    expect(files.some((f) => f.endsWith("audit.jsonl"))).toBe(true);
    expect(files.some((f) => f.endsWith(`${ID}.envelope.txt`))).toBe(true);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const s of planted) expect(text.includes(s), `${s} in ${f}`).toBe(false);
    }
  });
});
