// T09: `revise` edits recompile the preview host-side (protocol.md §Extension → host, decisions.md AC-05 rule).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { harness, ingestAndCompile, only, PLANTED_EMAIL, PLANTED_SECRET, walk } from "./helpers.js";
import type { Harness } from "./helpers.js";

type Edits = {
  removeItemIds: string[];
  keepUngroundedIds: string[];
  unredact: string[];
  moveToManifest: string[];
  moveToPush: string[];
};

const NONE: Edits = { removeItemIds: [], keepUngroundedIds: [], unredact: [], moveToManifest: [], moveToPush: [] };

async function revise(h: Harness, sessionId: string, previewId: string, edits: Partial<Edits>) {
  return only(await h.send({ type: "revise", sessionId, previewId, edits: { ...NONE, ...edits } }), "preview");
}

/** The placeholder the host assigned to the planted API key (kind "secret"). */
function secretPlaceholder(ingested: { redactions: Array<{ placeholder: string; kind: string }> }): string {
  const r = ingested.redactions.find((x) => x.placeholder.startsWith("[SECRET_"));
  expect(r, JSON.stringify(ingested.redactions)).toBeDefined();
  return r!.placeholder;
}

describe("T09 revise edits", () => {
  it("T09 revise edits: moveToManifest cuts a turn; moveToPush brings it back", async () => {
    const h = harness();
    const { sessionId, preview } = await ingestAndCompile(h, "small-chat");
    expect(preview.envelope).toContain("t008");

    const cut = await revise(h, sessionId, preview.previewId, { moveToManifest: ["t008"] });
    expect(cut.previewId).not.toBe(preview.previewId);
    expect(cut.hash).not.toBe(preview.hash);
    expect(cut.cutList).toContainEqual(expect.objectContaining({ ref: "t008", why: "excluded_by_user" }));
    expect(cut.stats.pushedTokens).toBeLessThan(preview.stats.pushedTokens);

    const back = await revise(h, sessionId, cut.previewId, { moveToPush: ["t008"] });
    expect(back.cutList.some((e) => e.ref === "t008")).toBe(false);
    expect(back.envelope).toContain("t008");
    // Not exactly equal: each compile mints a new random pack id, which tokenises differently.
    expect(back.stats.pushedTokens).toBeGreaterThan(cut.stats.pushedTokens);
  });

  it("T09 revise edits: removeItemIds acts like moveToManifest in verbatim mode", async () => {
    const h = harness();
    const { sessionId, preview } = await ingestAndCompile(h, "small-chat");
    const removed = await revise(h, sessionId, preview.previewId, { removeItemIds: ["t008"] });
    expect(removed.cutList).toContainEqual(expect.objectContaining({ ref: "t008", why: "excluded_by_user" }));
  });

  it("T09 revise edits: edits accumulate across revises", async () => {
    const h = harness();
    const { sessionId, preview } = await ingestAndCompile(h, "small-chat");
    const a = await revise(h, sessionId, preview.previewId, { moveToManifest: ["t008"] });
    const b = await revise(h, sessionId, a.previewId, { moveToManifest: ["t001"] });
    const refs = b.cutList.map((e) => e.ref);
    expect(refs).toContain("t008");
    expect(refs).toContain("t001");
  });

  it("T09 revise edits: a revise against a stale previewId is a hash_mismatch", async () => {
    const h = harness();
    const { sessionId, preview } = await ingestAndCompile(h, "small-chat");
    await revise(h, sessionId, preview.previewId, { moveToManifest: ["t008"] });
    const stale = only(
      await h.send({ type: "revise", sessionId, previewId: preview.previewId, edits: NONE }),
      "error",
    );
    expect(stale.code).toBe("hash_mismatch");
  });

  it("T09 revise edits: unredact reveals only the named placeholder and marks it revealed", async () => {
    const h = harness();
    const { sessionId, ingested, preview } = await ingestAndCompile(h, "small-chat");
    const ph = secretPlaceholder(ingested);
    expect(preview.envelope).toContain(ph);
    expect(preview.envelope).not.toContain(PLANTED_SECRET);

    const revealed = await revise(h, sessionId, preview.previewId, { unredact: [ph] });
    expect(revealed.envelope).toContain(PLANTED_SECRET);
    expect(revealed.envelope).not.toContain(ph);
    expect(revealed.envelope).not.toContain(PLANTED_EMAIL); // only the named one
    // Redacted-span flags for the revealed placeholder are gone; others remain.
    expect(revealed.flags.some((f) => f.kind === "redacted" && f.match === ph)).toBe(false);
    expect(revealed.flags.some((f) => f.kind === "redacted" && f.match !== ph)).toBe(true);

    // Sticky: a later revise without unredact keeps the value revealed.
    const later = await revise(h, sessionId, revealed.previewId, { moveToManifest: ["t001"] });
    expect(later.envelope).toContain(PLANTED_SECRET);

    const committed = only(
      await h.send({ type: "approve", sessionId, previewId: later.previewId, hash: later.hash }),
      "committed",
    );
    const pack = h.vault.readPack(committed.packId);
    expect(pack.ok).toBe(true);
    if (!pack.ok) return;
    expect(pack.value.redactions).toContainEqual({ placeholder: ph, kind: "secret", revealed: true });
    expect(pack.value.redactions.filter((r) => r.revealed).map((r) => r.placeholder)).toEqual([ph]);
    // Stored envelope equals the approved one (AC-15); the stored transcript is the revealed copy.
    const env = h.vault.readEnvelope(committed.packId);
    expect(env.ok && env.value).toBe(later.envelope);
    const tr = h.vault.readTranscript(committed.packId);
    expect(tr.ok && JSON.stringify(tr.value)).toContain(PLANTED_SECRET);
    // The unrevealed value never reaches disk (AC-05).
    for (const f of walk(h.root)) expect(readFileSync(f, "utf8")).not.toContain(PLANTED_EMAIL);
  });

  it("T09 revise edits: without unredact nothing is revealed and the stub error is gone", async () => {
    const h = harness();
    const { sessionId, preview } = await ingestAndCompile(h, "small-chat");
    const same = await revise(h, sessionId, preview.previewId, {});
    expect(same.envelope).not.toContain(PLANTED_SECRET);
    const r = await h.send({
      type: "revise",
      sessionId,
      previewId: same.previewId,
      edits: { ...NONE, unredact: ["[SECRET_99]"] },
    });
    expect(r[r.length - 1]?.type).toBe("preview"); // unknown placeholders are ignored, not an error
  });
});
