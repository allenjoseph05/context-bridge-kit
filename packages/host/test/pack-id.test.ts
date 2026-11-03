// Pack id collision guard: a pack id the vault already has is redrawn, never overwritten.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openVault } from "@cb/vault";
import type { HostToExt } from "@cb/schema";
import { createHost } from "../src/session.js";
import { loadFixture, T0, tempDir } from "./helpers.js";

/** A host whose pack ids come from `ids` in order (the last one repeats). */
function hostWithIds(ids: string[]) {
  const vault = openVault({ root: tempDir(), now: () => T0 });
  const replies: HostToExt[] = [];
  let i = 0;
  const host = createHost({
    vault,
    send: (m) => replies.push(m),
    now: () => T0,
    newPackId: () => ids[Math.min(i++, ids.length - 1)]!,
  });
  const send = async (msg: Record<string, unknown>): Promise<HostToExt> => {
    await host.handle({ requestId: randomUUID(), ...msg });
    return replies[replies.length - 1]!;
  };
  const previewAndApprove = async (): Promise<HostToExt> => {
    const ingested = await send({ type: "ingest", transcript: loadFixture("small-chat") });
    if (ingested.type !== "ingested") throw new Error(JSON.stringify(ingested));
    const preview = await send({
      type: "compile",
      sessionId: ingested.sessionId,
      selection: ingested.suggestedSelection,
      profile: "continue",
      route: "clipboard",
      mode: "verbatim",
    });
    if (preview.type !== "preview") return preview;
    return send({ type: "approve", sessionId: ingested.sessionId, previewId: preview.previewId, hash: preview.hash });
  };
  return { vault, previewAndApprove };
}

describe("pack id collisions", () => {
  it("fix a repeated pack id is redrawn", async () => {
    const h = hostWithIds(["cp_00000001", "cp_00000001", "cp_00000001", "cp_00000002"]);
    const a = await h.previewAndApprove();
    expect(a).toMatchObject({ type: "committed", packId: "cp_00000001" });
    const before = h.vault.readEnvelope("cp_00000001");
    const b = await h.previewAndApprove();
    expect(b).toMatchObject({ type: "committed", packId: "cp_00000002" });
    expect(h.vault.readEnvelope("cp_00000001")).toEqual(before);
    expect(h.vault.listPacks().map((m) => m.id).sort()).toEqual(["cp_00000001", "cp_00000002"]);
  });

  it("fix an id that keeps colliding gives vault_error and overwrites nothing", async () => {
    const h = hostWithIds(["cp_00000001"]);
    expect(await h.previewAndApprove()).toMatchObject({ type: "committed", packId: "cp_00000001" });
    const before = h.vault.readEnvelope("cp_00000001");
    expect(await h.previewAndApprove()).toMatchObject({ type: "error", code: "vault_error" });
    expect(h.vault.readEnvelope("cp_00000001")).toEqual(before);
    expect(h.vault.listPacks().map((m) => m.id)).toEqual(["cp_00000001"]);
  });
});
