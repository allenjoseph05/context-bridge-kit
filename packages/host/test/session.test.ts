import { readFileSync } from "node:fs";
import { ContextPack, PreviewMsg } from "@cb/schema";
import { sha256Hex } from "@cb/schema/node";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { suggestSelection } from "../src/session.js";
import {
  harness,
  ingestAndCompile,
  loadFixture,
  makeTranscript,
  only,
  packFiles,
  PLANTED_EMAIL,
  PLANTED_SECRET,
  text,
  walk,
} from "./helpers.js";

describe("hello", () => {
  it("T07 hello", async () => {
    const h = harness();
    const r = only(await h.sendRaw({ type: "hello", requestId: "r-hello", protocol: 1 }), "hello_ok");
    expect(r.requestId).toBe("r-hello");
    expect(r.protocol).toBe(1);
    expect(r.hostVersion).toMatch(/\S/);
    // Model calls arrive in T17.
    expect(r.model.available).toBe(false);
  });
});

describe("ingest", () => {
  it("AC-05 AC-06 ingest", async () => {
    const h = harness();

    const small = only(
      await h.sendRaw({ type: "ingest", requestId: "r-ing", transcript: loadFixture("small-chat") }),
      "ingested",
    );
    expect(small.requestId).toBe("r-ing");
    expect(small.sessionId).toMatch(/^s_[0-9a-f]{8}$/);
    expect(small.turns.map((t) => t.id)).toEqual(["t001", "t002", "t003", "t004", "t005", "t006", "t007", "t008"]);
    expect(small.attachments).toEqual([]);
    expect(small.missingFiles).toEqual([]);
    expect(small.suggestedProfile).toBe("continue");
    // Eight turns: all within the last 10.
    expect(small.suggestedSelection).toEqual(small.turns.map((t) => t.id));

    // AC-05: the fake key and the email are redacted in the turns the host will use.
    const t007 = JSON.stringify(small.turns.find((t) => t.id === "t007"));
    expect(t007).not.toContain(PLANTED_SECRET);
    expect(t007).not.toContain(PLANTED_EMAIL);
    expect(small.redactions.map((r) => r.kind)).toEqual(expect.arrayContaining(["secret", "email"]));
    for (const r of small.redactions) expect(t007).toContain(r.placeholder);
    expect(small.flags).toContainEqual(expect.objectContaining({ ref: "t007", kind: "redacted" }));
    // Values never leave the host, not even in flags or redaction lists.
    expect(JSON.stringify(small)).not.toContain(PLANTED_SECRET);
    expect(JSON.stringify(small)).not.toContain(PLANTED_EMAIL);

    // AC-06: instruction-like text is flagged, not removed.
    const inj = only(await h.send({ type: "ingest", transcript: loadFixture("injection-chat") }), "ingested");
    expect(inj.sessionId).not.toBe(small.sessionId);
    const flagged = inj.flags.filter((f) => f.kind === "possible_instruction");
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.every((f) => f.ref === "t003")).toBe(true);
    const t003 = inj.turns.find((t) => t.id === "t003")!;
    const original = loadFixture("injection-chat").turns.find((t) => t.id === "t003")!;
    for (const f of flagged) expect(JSON.stringify(original.parts)).toContain(f.match!);
    expect(t003.parts.length).toBe(original.parts.length);

    expect(h.host.sessionCount()).toBe(2);
  });

  it("T07 ingest always sanitises, even a transcript that claims it was sanitised", async () => {
    const h = harness();
    const claimed = { ...loadFixture("small-chat"), extras: { sanitized: true, sanitised: true } };
    const r = only(await h.send({ type: "ingest", transcript: claimed }), "ingested");
    expect(JSON.stringify(r.turns)).not.toContain(PLANTED_SECRET);
    expect(r.redactions.length).toBeGreaterThan(0);
    // Turn hashes are recomputed over the sanitised parts.
    const t007 = r.turns.find((t) => t.id === "t007")!;
    expect(t007.sha256).not.toBe(claimed.turns.find((t) => t.id === "t007")!.sha256);
  });
});

describe("suggested selection", () => {
  it("T07 suggested selection", () => {
    const t = makeTranscript(
      [
        [text("I have 3 questions about the plan.")], // t001: a number without a unit
        [text("Here:"), { kind: "code", lang: "ts", content: "const x = 1;" }], // t002: code
        [text("Latency is 120 ms at p95.")], // t003: number with a unit
        [{ kind: "table", markdown: "| a | b |\n| - | - |\n| 1 | 2 |" }], // t004: table
        [text("See the file."), { kind: "attachment", attachmentId: "a001" }], // t005: attachment
        [text("Plain words only.")], // t006: earlier than the last 10, nothing special
        ...Array.from({ length: 10 }, (_, i) => [text(`Recent turn ${i}.`)]), // t007–t016
      ],
      [
        {
          id: "a001",
          turnId: "t005",
          origin: "user_upload",
          name: "notes.txt",
          mime: "text/plain",
          status: "listed",
          flags: [],
        },
      ],
    );
    expect(suggestSelection(t)).toEqual([
      "t002",
      "t003",
      "t004",
      "t005",
      "t007",
      "t008",
      "t009",
      "t010",
      "t011",
      "t012",
      "t013",
      "t014",
      "t015",
      "t016",
    ]);
  });
});

describe("invalid messages", () => {
  it("T07 invalid messages", async () => {
    const h = harness();
    const { sessionId, preview } = await ingestAndCompile(h, "small-chat");
    const sessions = h.host.sessionCount();

    const cases: unknown[] = [
      "not an object",
      null,
      42,
      { requestId: "r1" },
      { type: "bogus", requestId: "r2" },
      { type: "hello", requestId: "r3", protocol: 2 },
      { type: "ingest", requestId: "r4", transcript: { schema: "transcript/0.2" } },
      { type: "compile", requestId: "r5", sessionId, selection: ["t001"], profile: "nope", route: "clipboard", mode: "verbatim" },
      { type: "approve", requestId: "r6", sessionId, previewId: preview.previewId, hash: "XYZ" },
      { type: "revise", requestId: "r7", sessionId, previewId: preview.previewId, edits: { removeItemIds: [] } },
      { type: "delete_pack", requestId: "r8", packId: "../../etc/passwd" },
    ];
    for (const raw of cases) {
      const r = only(await h.sendRaw(raw), "error");
      expect(r.code, JSON.stringify(raw)).toBe("invalid_message");
      const rid = (raw as { requestId?: unknown } | null)?.requestId;
      // Echo the requestId when the message has a usable one; otherwise "unknown".
      expect(r.requestId).toBe(typeof rid === "string" && rid !== "" ? rid : "unknown");
    }

    // add_file is deferred to T15/T16.
    const af = only(
      await h.send({ type: "add_file", sessionId, name: "x.txt", mime: "text/plain", dataBase64: "eA==" }),
      "error",
    );
    expect(af.code).toBe("invalid_message");
    expect(af.message).toBe("attachments arrive in T15/T16");

    // Unknown session.
    const us = only(
      await h.send({
        type: "compile",
        sessionId: "s_00000000",
        selection: [],
        profile: "continue",
        route: "clipboard",
        mode: "verbatim",
      }),
      "error",
    );
    expect(us.code).toBe("unknown_session");

    // State unchanged: same sessions, nothing written, and the earlier preview still approves.
    expect(h.host.sessionCount()).toBe(sessions);
    expect(packFiles(h.root)).toEqual([]);
    only(
      await h.send({ type: "approve", sessionId, previewId: preview.previewId, hash: preview.hash }),
      "committed",
    );
  });
});

describe("compile", () => {
  it("AC-15 preview hash", async () => {
    const h = harness();
    const { sessionId, preview } = await ingestAndCompile(h, "small-chat");
    expect(PreviewMsg.safeParse(preview).success).toBe(true);
    expect(preview.sessionId).toBe(sessionId);
    expect(preview.previewId).toMatch(/^p_[0-9a-f]{8}$/);
    expect(preview.images).toEqual([]);
    expect(preview.hash).toBe(
      sha256Hex(preview.envelope + "\n" + JSON.stringify(preview.images.map((i) => i.attachmentId))),
    );
    expect(preview.envelope).not.toContain(PLANTED_SECRET);
    expect(preview.stats.cutCount).toBe(preview.cutList.length);

    // A second compile yields a new preview id.
    const again = only(
      await h.send({
        type: "compile",
        sessionId,
        selection: ["t001", "t002"],
        profile: "continue",
        route: "clipboard",
        mode: "verbatim",
      }),
      "preview",
    );
    expect(again.previewId).not.toBe(preview.previewId);
    expect(again.hash).toBe(sha256Hex(again.envelope + "\n[]"));
  });

  it("T07 condensed mode falls back to verbatim with a notice", async () => {
    const h = harness();
    const { preview } = await ingestAndCompile(h, "small-chat", { mode: "condensed" });
    expect(preview.notices).toContain("condensed mode arrives in T19");
  });

  it("T07 over_budget maps to the protocol error with needed and budget", async () => {
    const h = harness();
    // 300 short turns with every other one selected: the manifest alone exceeds the budget.
    const t = makeTranscript(Array.from({ length: 300 }, (_, i) => [text(`Short turn number ${i}.`)]));
    const ing = only(await h.send({ type: "ingest", transcript: t }), "ingested");
    const r = only(
      await h.send({
        type: "compile",
        sessionId: ing.sessionId,
        selection: ing.turns.filter((_, i) => i % 2 === 0).map((x) => x.id),
        profile: "second_opinion",
        route: "mcp",
        mode: "verbatim",
      }),
      "error",
    );
    expect(r.code).toBe("over_budget");
    expect(r.recoverable).toBe(true);
    expect(r.budget).toBe(1700); // floor(min(2000, 6000) × 0.85)
    expect(r.needed).toBeGreaterThan(r.budget!);
  });

  it("T07 revise recompiles with edits and replaces the preview", async () => {
    const h = harness();
    const { sessionId, preview } = await ingestAndCompile(h, "small-chat");
    const revised = only(
      await h.send({
        type: "revise",
        sessionId,
        previewId: preview.previewId,
        edits: { removeItemIds: [], keepUngroundedIds: [], unredact: [], moveToManifest: ["t008"], moveToPush: [] },
      }),
      "preview",
    );
    expect(revised.previewId).not.toBe(preview.previewId);
    expect(revised.cutList).toContainEqual(expect.objectContaining({ ref: "t008", why: "excluded_by_user" }));
    expect(revised.hash).toBe(sha256Hex(revised.envelope + "\n[]"));

    // The old preview is now stale.
    const stale = only(
      await h.send({ type: "approve", sessionId, previewId: preview.previewId, hash: preview.hash }),
      "error",
    );
    expect(stale.code).toBe("hash_mismatch");
    only(
      await h.send({ type: "approve", sessionId, previewId: revised.previewId, hash: revised.hash }),
      "committed",
    );
  });
});

describe("approve", () => {
  it("AC-15 hash mismatch writes nothing", async () => {
    const h = harness();
    const { sessionId, preview } = await ingestAndCompile(h, "small-chat");

    const wrongHash = only(
      await h.send({ type: "approve", sessionId, previewId: preview.previewId, hash: "0".repeat(64) }),
      "error",
    );
    expect(wrongHash.code).toBe("hash_mismatch");

    const second = only(
      await h.send({
        type: "compile",
        sessionId,
        selection: ["t001"],
        profile: "continue",
        route: "clipboard",
        mode: "verbatim",
      }),
      "preview",
    );
    // Stale previewId with its own (formerly valid) hash.
    const stale = only(
      await h.send({ type: "approve", sessionId, previewId: preview.previewId, hash: preview.hash }),
      "error",
    );
    expect(stale.code).toBe("hash_mismatch");
    // Current previewId with the stale hash.
    const mixed = only(
      await h.send({ type: "approve", sessionId, previewId: second.previewId, hash: preview.hash }),
      "error",
    );
    expect(mixed.code).toBe("hash_mismatch");

    expect(packFiles(h.root)).toEqual([]);
    expect(h.vault.listPacks()).toEqual([]);
    const audit = walk(h.root).find((p) => p.endsWith("audit.jsonl"));
    const lines = audit ? readFileSync(audit, "utf8") : "";
    expect(lines).not.toContain('"approved"');
  });

  it("AC-15 nothing stored before approval", async () => {
    const h = harness();
    const { sessionId, preview } = await ingestAndCompile(h, "small-chat");
    await h.send({
      type: "revise",
      sessionId,
      previewId: preview.previewId,
      edits: { removeItemIds: [], keepUngroundedIds: [], unredact: [], moveToManifest: ["t001"], moveToPush: [] },
    });
    expect(packFiles(h.root)).toEqual([]);
    expect(h.vault.listPacks()).toEqual([]);
    const lst = only(await h.send({ type: "list_packs" }), "packs");
    expect(lst.packs).toEqual([]);
  });

  it("AC-17 deliverables", async () => {
    for (const route of ["clipboard", "bundle", "mcp"] as const) {
      const h = harness();
      const { sessionId, preview } = await ingestAndCompile(h, "small-chat", { route });
      const c = only(
        await h.send({ type: "approve", sessionId, previewId: preview.previewId, hash: preview.hash }),
        "committed",
      );
      expect(c.route).toBe(route);
      expect(c.packId).toMatch(/^cp_[0-9a-f]{8}$/);
      expect(c.deliverable.kind).toBe(route);

      // The stored envelope is exactly the previewed one.
      const env = h.vault.readEnvelope(c.packId);
      expect(env).toEqual({ ok: true, value: preview.envelope });
      const pack = h.vault.readPack(c.packId);
      expect(pack.ok).toBe(true);
      if (pack.ok) {
        expect(ContextPack.safeParse(pack.value).success).toBe(true);
        expect(pack.value.destination.route).toBe(route);
      }
      const tr = h.vault.readTranscript(c.packId);
      expect(tr.ok).toBe(true);
      expect(h.vault.readIndex(c.packId).ok).toBe(true);

      const d = c.deliverable;
      if (d.kind === "clipboard") expect(d.text).toBe(preview.envelope);
      if (d.kind === "bundle") {
        expect(d.fileName).toMatch(/\.zip$/);
        const files = unzipSync(Buffer.from(d.zipBase64, "base64"));
        expect(strFromU8(files["pack.md"]!)).toBe(preview.envelope);
        expect(Object.keys(files)).toContain("manifest.json");
      }
      if (d.kind === "mcp") {
        expect(d.packId).toBe(c.packId);
        expect(d.instruction).toContain(c.packId);
      }

      // Audit: approved with pack and route, no content.
      const audit = readFileSync(walk(h.root).find((p) => p.endsWith("audit.jsonl"))!, "utf8");
      const events = audit.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
      expect(events).toContainEqual(
        expect.objectContaining({ event: "approved", packId: c.packId, route, sessionId }),
      );

      // A second approve of the same preview does not write a second pack.
      const again = only(
        await h.send({ type: "approve", sessionId, previewId: preview.previewId, hash: preview.hash }),
        "error",
      );
      expect(again.code).toBe("hash_mismatch");
      expect(h.vault.listPacks()).toHaveLength(1);
    }
  });

  it("T07 no planted secret in any vault file or audit line after approve", async () => {
    const h = harness();
    for (const route of ["clipboard", "bundle", "mcp"] as const) {
      const { sessionId, preview } = await ingestAndCompile(h, "small-chat", { route });
      only(
        await h.send({ type: "approve", sessionId, previewId: preview.previewId, hash: preview.hash }),
        "committed",
      );
    }
    const files = walk(h.root);
    expect(files.some((p) => p.endsWith("audit.jsonl"))).toBe(true);
    expect(packFiles(h.root).length).toBeGreaterThanOrEqual(9);
    for (const p of files) {
      const content = readFileSync(p, "utf8");
      expect(content, p).not.toContain(PLANTED_SECRET);
      expect(content, p).not.toContain(PLANTED_EMAIL);
    }
  });
});

describe("sessions and packs", () => {
  it("T07 close discards sessions and their redaction values", async () => {
    const h = harness();
    const { sessionId } = await ingestAndCompile(h, "small-chat");
    expect(h.host.sessionCount()).toBe(1);
    h.host.close();
    expect(h.host.sessionCount()).toBe(0);
    const r = only(
      await h.send({
        type: "compile",
        sessionId,
        selection: ["t001"],
        profile: "continue",
        route: "clipboard",
        mode: "verbatim",
      }),
      "error",
    );
    expect(r.code).toBe("unknown_session");
  });

  it("T07 list and delete packs", async () => {
    const h = harness();
    const { sessionId, preview } = await ingestAndCompile(h, "small-chat");
    const c = only(
      await h.send({ type: "approve", sessionId, previewId: preview.previewId, hash: preview.hash }),
      "committed",
    );
    const listed = only(await h.send({ type: "list_packs" }), "packs");
    expect(listed.packs.map((p) => p.id)).toEqual([c.packId]);

    const del = only(await h.send({ type: "delete_pack", packId: c.packId }), "deleted");
    expect(del.packId).toBe(c.packId);
    expect(only(await h.send({ type: "list_packs" }), "packs").packs).toEqual([]);
    expect(packFiles(h.root)).toEqual([]);

    // Idempotent: deleting a pack that is already gone still answers `deleted`.
    const again = only(await h.send({ type: "delete_pack", packId: c.packId }), "deleted");
    expect(again.packId).toBe(c.packId);
    const never = only(await h.send({ type: "delete_pack", packId: "cp_00000000" }), "deleted");
    expect(never.packId).toBe("cp_00000000");
  });
});
