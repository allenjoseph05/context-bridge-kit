// T11: on approve the host stores the shareable transcript and a BM25 index built from it
// (specs/plan/host.md §Pipeline, approve).
import { search } from "@cb/index";
import type { IndexJSON } from "@cb/index";
import { describe, expect, it } from "vitest";
import { harness, makeTranscript, only, text } from "./helpers.js";

describe("@cb/host approve stores the pull data", () => {
  it("T11 approve stores shareable transcript and index", async () => {
    const h = harness();
    const transcript = makeTranscript([
      [text("Which queue should we use? heron7kite")],
      [text("Use a simple table-backed queue. ibis8wren")],
      [text("Off the record: budget is tight. otter9mole")],
      [text("Then keep it to one service. puffin4newt")],
    ]);
    const ingested = only(await h.send({ type: "ingest", transcript }), "ingested");
    const preview = only(
      await h.send({
        type: "compile",
        sessionId: ingested.sessionId,
        selection: ["t001", "t002", "t004"], // t003 left out by the user
        profile: "continue",
        route: "mcp",
        mode: "verbatim",
      }),
      "preview",
    );
    const committed = only(
      await h.send({ type: "approve", sessionId: ingested.sessionId, previewId: preview.previewId, hash: preview.hash }),
      "committed",
    );

    const stored = h.vault.readTranscript(committed.packId);
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    expect(stored.value.turns.map((t) => t.id)).toEqual(["t001", "t002", "t004"]);
    expect(JSON.stringify(stored.value)).not.toContain("otter9mole");

    const index = h.vault.readIndex(committed.packId);
    expect(index.ok).toBe(true);
    if (!index.ok) return;
    const idx = index.value as IndexJSON;
    expect(search(idx, "ibis8wren", 8).map((r) => r.ref)).toEqual(["t002"]);
    expect(search(idx, "puffin4newt", 8).map((r) => r.ref)).toEqual(["t004"]);
    expect(search(idx, "otter9mole", 8)).toEqual([]);
  });
});
