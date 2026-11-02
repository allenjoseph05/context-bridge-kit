import { describe, expect, it } from "vitest";
import {
  Attachment,
  CaptureError,
  ContextPack,
  DestinationProfile,
  Flag,
  Item,
  ItemDraft,
  ManifestEntry,
  PackMeta,
  Part,
  Turn,
  Transcript,
} from "../src/index.js";
import * as ex from "./examples.js";

describe("@cb/schema schemas", () => {
  it("T01 valid examples parse", () => {
    for (const p of Object.values(ex.parts)) expect(Part.safeParse(p).success).toBe(true);
    expect(Turn.safeParse(ex.turnUser).success).toBe(true);
    expect(Turn.safeParse(ex.turnAssistant).success).toBe(true);
    expect(Attachment.safeParse(ex.attachment).success).toBe(true);
    expect(Attachment.safeParse(ex.attachmentListed).success).toBe(true);
    expect(Transcript.safeParse(ex.transcript).success).toBe(true);
    expect(CaptureError.safeParse(ex.captureError).success).toBe(true);
    expect(ItemDraft.safeParse(ex.itemDraft).success).toBe(true);
    expect(ItemDraft.safeParse(ex.itemDraftFact).success).toBe(true);
    expect(Item.safeParse(ex.item).success).toBe(true);
    expect(DestinationProfile.safeParse(ex.destination).success).toBe(true);
    for (const m of ex.manifestEntries) expect(ManifestEntry.safeParse(m).success).toBe(true);
    expect(ContextPack.safeParse(ex.contextPack).success).toBe(true);
    expect(PackMeta.safeParse(ex.packMeta).success).toBe(true);
    expect(Flag.safeParse(ex.flag).success).toBe(true);
  });

  it("T01 invalid examples rejected", () => {
    // turn with zero parts
    expect(Turn.safeParse({ ...ex.turnUser, parts: [] }).success).toBe(false);
    expect(
      Transcript.safeParse({ ...ex.transcript, turns: [{ ...ex.turnUser, parts: [] }] }).success,
    ).toBe(false);
    // transcript with zero turns
    expect(Transcript.safeParse({ ...ex.transcript, turns: [] }).success).toBe(false);
    // item with no sourceTurns
    expect(ItemDraft.safeParse({ ...ex.itemDraftFact, sourceTurns: [] }).success).toBe(false);
    expect(Item.safeParse({ ...ex.item, sourceTurns: [] }).success).toBe(false);
    // evidence over 200 chars
    expect(ItemDraft.safeParse({ ...ex.itemDraftFact, evidence: "x".repeat(201) }).success).toBe(
      false,
    );
    expect(ItemDraft.safeParse({ ...ex.itemDraftFact, evidence: "x".repeat(200) }).success).toBe(
      true,
    );
    // text over 280 chars
    expect(ItemDraft.safeParse({ ...ex.itemDraftFact, text: "x".repeat(281) }).success).toBe(false);
    // unknown part kind
    expect(Part.safeParse({ kind: "video", url: "https://example.org/v" }).success).toBe(false);
    expect(Turn.safeParse({ ...ex.turnUser, parts: [{ kind: "video", text: "x" }] }).success).toBe(
      false,
    );
    // bad ID formats
    expect(Turn.safeParse({ ...ex.turnUser, id: "t1" }).success).toBe(false);
    expect(Turn.safeParse({ ...ex.turnUser, id: "turn001" }).success).toBe(false);
    expect(Attachment.safeParse({ ...ex.attachment, id: "a0001" }).success).toBe(false);
    expect(Attachment.safeParse({ ...ex.attachment, turnId: "x001" }).success).toBe(false);
    expect(Item.safeParse({ ...ex.item, id: "i01" }).success).toBe(false);
    expect(ItemDraft.safeParse({ ...ex.itemDraftFact, sourceTurns: ["t01"] }).success).toBe(false);
    expect(ContextPack.safeParse({ ...ex.contextPack, id: "cp_9F2C41AB" }).success).toBe(false);
    expect(ContextPack.safeParse({ ...ex.contextPack, id: "cp_9f2c41a" }).success).toBe(false);
    expect(PackMeta.safeParse({ ...ex.packMeta, id: "pack_1" }).success).toBe(false);
    expect(ManifestEntry.safeParse({ ref: "turn-1", what: "x", why: "budget" }).success).toBe(false);
    // bad hash
    expect(Turn.safeParse({ ...ex.turnUser, sha256: "abc" }).success).toBe(false);
    // unknown enum values
    expect(ManifestEntry.safeParse({ ref: "t001", what: "x", why: "because" }).success).toBe(false);
    expect(Attachment.safeParse({ ...ex.attachment, status: "lost" }).success).toBe(false);
  });

  it("T01 topic required for decisions", () => {
    const { topic: _topic, ...noTopic } = ex.itemDraft;
    expect(ItemDraft.safeParse({ ...noTopic, kind: "decision" }).success).toBe(false);
    expect(ItemDraft.safeParse({ ...noTopic, kind: "constraint" }).success).toBe(false);
    expect(
      Item.safeParse({ ...noTopic, kind: "decision", id: "i001", status: "active", flags: [] })
        .success,
    ).toBe(false);
    expect(ItemDraft.safeParse({ ...noTopic, kind: "fact" }).success).toBe(true);
    expect(
      ItemDraft.safeParse({ ...noTopic, kind: "constraint", topic: "latency budget" }).success,
    ).toBe(true);
    // topic is 1–4 words
    expect(ItemDraft.safeParse({ ...noTopic, kind: "decision", topic: "" }).success).toBe(false);
    expect(
      ItemDraft.safeParse({ ...noTopic, kind: "decision", topic: "one two three four five" })
        .success,
    ).toBe(false);
  });
});
