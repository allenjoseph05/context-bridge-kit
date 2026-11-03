// T11 / AC-13: pull never reveals what the user deliberately left out (mcp-server.md §Rules,
// host.md §Pipeline, approve).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  allText,
  call,
  connect,
  filler,
  makeTranscript,
  payload,
  seedVault,
  text,
  walk,
} from "./helpers.js";

/** The manifest reason for a turn id; ranges such as `t001-t002` cover their turns. */
function whyOf(
  manifest: ReadonlyArray<{ ref: string; why: string }>,
  id: string,
): string | undefined {
  const n = Number(id.slice(1));
  return manifest.find((m) => {
    const r = /^t(\d{3})(?:-t(\d{3}))?$/.exec(m.ref);
    return r !== null && Number(r[1]) <= n && n <= Number(r[2] ?? r[1]);
  })?.why;
}

/** A text attachment of `t003`, stored in the vault before ingest. */
function textAttachment(
  seed: ReturnType<typeof seedVault>,
  id: string,
  body: string,
): Record<string, unknown> {
  const sha = seed.vault.putFile(Buffer.from(body, "utf8"));
  expect(seed.vault.putText(sha, body).ok).toBe(true);
  return {
    id,
    turnId: "t003",
    origin: "user_upload",
    name: `${id}-notes.txt`,
    mime: "text/plain",
    bytes: body.length,
    sha256: sha,
    status: "extracted",
    extractRef: `files/${sha}.txt`,
    flags: [],
  };
}

/** One distinctive phrase per turn; the tokeniser keeps each word whole. */
const phrase = (i: number): string => `quokka${i}zebra marmot${i}lynx`;

describe("@cb/mcp-server deliberate exclusions", () => {
  it("T11 excluded turns are not pullable", async () => {
    const seed = seedVault();
    // An earlier pack (all turns shared) references the shared sheet.
    const shared = textAttachment(seed, "a001", "Shared reference sheet v2 (synthetic).");
    await seed.approve(
      makeTranscript(
        [
          [text("See the sheet."), { kind: "attachment", attachmentId: "a001" }],
          [text("Seen.")],
          [text("Ok.")],
        ],
        [shared],
      ),
    );
    // t003 carries a private file (only here) and the shared sheet.
    const own = textAttachment(seed, "a001", "Private excluded notes quokka3zebra (synthetic).");
    const files = (sha: unknown): string[] => [
      join(seed.root, "files", String(sha)),
      join(seed.root, "files", `${String(sha)}.txt`),
    ];
    for (const f of [...files(own.sha256), ...files(shared.sha256)])
      expect(existsSync(f), f).toBe(true);

    // t002 is huge (cut for budget, stays pullable); t003 is left out by the user.
    const transcript = makeTranscript(
      [
        [text(`Opening question. ${phrase(1)}`)],
        [text(`Long answer. ${phrase(2)} ${filler("bulk", 5600)}`)],
        [
          text(`A private aside I left out. ${phrase(3)}`),
          { kind: "attachment", attachmentId: "a001" },
          { kind: "attachment", attachmentId: "a002" },
        ],
        [text(`Short answer. ${phrase(4)}`)],
        [text(`Follow-up. ${phrase(5)}`)],
        [text(`Final answer. ${phrase(6)}`)],
      ],
      [own, { ...shared, id: "a002" }],
    );
    const { packId, envelope } = await seed.approve(transcript, {
      selection: ["t001", "t002", "t004", "t005", "t006"],
    });
    const pack = seed.vault.readPack(packId);
    expect(pack.ok).toBe(true);
    const manifest = pack.ok ? pack.value.push.manifest : [];
    expect(whyOf(manifest, "t002")).toBe("budget");
    expect(whyOf(manifest, "t003")).toBe("excluded_by_user");
    expect(envelope).not.toContain("quokka3zebra");

    const client = await connect(seed.root);
    const search = await call(client, "search_history", {
      packId,
      query: "quokka3zebra marmot3lynx",
      k: 8,
    });
    expect(search.isError).toBeFalsy();
    expect(allText(search)).not.toMatch(/\bt003\b/);
    expect(allText(search)).not.toContain("quokka3zebra");

    const refused = await call(client, "get_turns", { packId, turnIds: ["t003"] });
    expect(allText(refused)).toContain("t003: not available: excluded by the user");
    expect(allText(refused)).not.toContain("quokka3zebra");

    // The excluded turn's own file is deleted at approve; the shared one stays for the other pack.
    for (const f of files(own.sha256)) expect(existsSync(f), f).toBe(false);
    for (const f of files(shared.sha256)) expect(existsSync(f), f).toBe(true);

    // The excluded text was never written to the vault (or no longer is).
    for (const f of walk(seed.root)) {
      expect(readFileSync(f, "utf8"), f).not.toContain("quokka3zebra");
    }

    // A budget-cut turn is still pullable and searchable.
    const cut = await call(client, "get_turns", { packId, turnIds: ["t002"] });
    expect(payload(cut).startsWith("[t002 · assistant]")).toBe(true);
    expect(payload(cut)).toContain("quokka2zebra");
    expect(
      allText(await call(client, "search_history", { packId, query: "quokka2zebra" })),
    ).toMatch(/\bt002\b/);
  });

  it("AC-13 blind withholds assistant turns from pull", async () => {
    const seed = seedVault();
    const transcript = makeTranscript(
      Array.from({ length: 6 }, (_, i) => [text(`Turn ${i + 1}. ${phrase(i + 1)}`)]),
    );
    const { packId } = await seed.approve(transcript, { profile: "second_opinion", blind: true });
    const client = await connect(seed.root);

    const assistant = transcript.turns.filter((t) => t.role === "assistant");
    expect(assistant.length).toBe(3);
    for (const t of assistant) {
      const n = Number(t.id.slice(1));
      const r = await call(client, "get_turns", { packId, turnIds: [t.id] });
      expect(allText(r)).toContain(`${t.id}: not available: withheld by the profile (blind)`);
      expect(allText(r)).not.toContain(`quokka${n}zebra`);
      const s = await call(client, "search_history", {
        packId,
        query: `quokka${n}zebra marmot${n}lynx`,
        k: 8,
      });
      expect(allText(s)).not.toMatch(new RegExp(`\\b${t.id}\\b`));
      expect(allText(s)).not.toContain(`quokka${n}zebra`);
      for (const f of walk(seed.root))
        expect(readFileSync(f, "utf8"), f).not.toContain(`quokka${n}zebra`);
    }
    // User turns stay pullable.
    const user = await call(client, "get_turns", { packId, turnIds: ["t001", "t003"] });
    expect(payload(user)).toContain("quokka1zebra");
    expect(payload(user)).toContain("quokka3zebra");
  });
});
