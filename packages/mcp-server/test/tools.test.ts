// T11 acceptance tests: the five read-only MCP tools (specs/tasks/T11-mcp-server.md).
import { renderTurn } from "@cb/compiler";
import { countTokens } from "@cb/tokens";
import type { Transcript } from "@cb/schema";
import { describe, expect, it } from "vitest";
import {
  allText,
  auditLines,
  call,
  connect,
  DAY,
  filler,
  loadFixture,
  makeTranscript,
  NOTICE_RE,
  payload,
  seedVault,
  T0,
  text,
  texts,
  TRUNCATED_RE,
} from "./helpers.js";
import type { Seed, ToolResult } from "./helpers.js";

const TOOLS = ["get_attachment", "get_pack", "get_turns", "list_packs", "search_history"];
const NOT_FOUND = "pack not found or expired";

/** A 1×1 transparent PNG (synthetic). */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Ten turns of ~450 tokens each: more than one 4,000-token page, and an envelope over 4,000. */
function longTranscript(): Transcript {
  return makeTranscript(
    Array.from({ length: 12 }, (_, i) => [text(`turn ${i + 1}: ${filler(`w${i + 1}x`, 450)}`)]),
  );
}

const PAGES = [filler("pga", 100), filler("pgb", 100), filler("pgc", 4500)];
const DOC_TEXT = PAGES.join("");
const PAGE_OFFSETS = [0, PAGES[0]!.length, PAGES[0]!.length + PAGES[1]!.length];
const LISTED_REASON = "docx · not processed; attach it directly";

/** A pack whose first turn carries a png (carried), a paged txt (extracted) and a docx (listed). */
async function attachmentPack(seed: Seed): Promise<string> {
  const pngSha = seed.vault.putFile(PNG);
  const txtSha = seed.vault.putFile(Buffer.from(DOC_TEXT, "utf8"));
  const put = seed.vault.putText(txtSha, DOC_TEXT);
  expect(put.ok).toBe(true);
  const transcript = makeTranscript(
    [
      [
        text("Here are the mock-up, the notes and the brief."),
        { kind: "attachment", attachmentId: "a001" },
        { kind: "attachment", attachmentId: "a002" },
        { kind: "attachment", attachmentId: "a003" },
      ],
      [text("Thanks, I have looked at all three.")],
    ],
    [
      { id: "a001", turnId: "t001", origin: "user_upload", name: "mockup.png", mime: "image/png",
        bytes: PNG.length, sha256: pngSha, status: "carried", summary: "image · 1×1 · png", flags: [] },
      { id: "a002", turnId: "t001", origin: "user_upload", name: "notes.txt", mime: "text/plain",
        bytes: DOC_TEXT.length, sha256: txtSha, status: "extracted", extractRef: `files/${txtSha}.txt`,
        summary: "text · 3 pages", pageOffsets: PAGE_OFFSETS, flags: [] },
      { id: "a003", turnId: "t001", origin: "user_upload", name: "brief.docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        status: "listed", reason: LISTED_REASON, flags: [] },
    ],
  );
  return (await seed.approve(transcript)).packId;
}

/** Follow `offset` hints from `first`; returns the page bodies (suffix removed) in order. */
async function allPages(fetch: (offset?: number) => Promise<ToolResult>): Promise<string[]> {
  const pages: string[] = [];
  let offset: number | undefined;
  for (let i = 0; i < 50; i += 1) {
    const r = await fetch(offset);
    expect(r.isError, allText(r)).toBeFalsy();
    expect(countTokens(allText(r))).toBeLessThanOrEqual(4000);
    const body = payload(r);
    const m = TRUNCATED_RE.exec(body);
    if (m === null) {
      pages.push(body);
      return pages;
    }
    pages.push(body.slice(0, m.index));
    offset = Number(m[1]);
  }
  throw new Error("pages never ended");
}

describe("@cb/mcp-server tools", () => {
  it("AC-18 five read-only tools", async () => {
    const client = await connect(seedVault().root);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS);
    for (const t of tools) {
      expect(t.annotations, t.name).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
  });

  it("AC-18 only committed unexpired packs", async () => {
    const seed = seedVault();
    const { packId } = await seed.approve(loadFixture("small-chat"));
    const now = await connect(seed.root);
    const listed = allText(await call(now, "list_packs"));
    expect(listed).toContain(packId);

    const later = await connect(seed.root, () => new Date(T0.getTime() + 8 * DAY));
    expect(allText(await call(later, "list_packs"))).not.toContain(packId);

    const cases: Array<[typeof now, string]> = [
      [later, packId], // expired
      [now, "cp_deadbeef"], // unknown
      [now, "../../audit"], // not an id at all
    ];
    for (const [client, id] of cases) {
      const results = [
        await call(client, "get_pack", { packId: id }),
        await call(client, "search_history", { packId: id, query: "storage" }),
        await call(client, "get_turns", { packId: id, turnIds: ["t001"] }),
        await call(client, "get_attachment", { packId: id, attachmentId: "a001" }),
      ];
      for (const r of results) {
        expect(r.isError, `${id}: ${allText(r)}`).toBe(true);
        expect(allText(r)).toContain(NOT_FOUND);
      }
    }
  });

  it("T11 get_pack", async () => {
    const seed = seedVault();
    const { packId, envelope } = await seed.approve(loadFixture("small-chat"));
    const r = await call(await connect(seed.root), "get_pack", { packId });
    expect(r.isError).toBeFalsy();
    const t = texts(r);
    expect(t[0]).toMatch(NOTICE_RE);
    const stored = seed.vault.readEnvelope(packId);
    expect(stored.ok).toBe(true);
    expect(t[1]).toBe(stored.ok ? stored.value : "");
    expect(t[1]).toBe(envelope);
  });

  it("T11 get_pack within approved budget", async () => {
    const seed = seedVault();
    const { packId, envelope, budget } = await seed.approve(longTranscript());
    // Precondition: this envelope is over the pull cap, so a cut would show.
    expect(countTokens(envelope)).toBeGreaterThan(4000);
    const r = await call(await connect(seed.root), "get_pack", { packId });
    const t = texts(r);
    expect(t[1]).toBe(envelope);
    expect(t[1]).not.toMatch(TRUNCATED_RE);
    expect(countTokens(t[1]!)).toBeLessThanOrEqual(budget);
  });

  it("T11 get_turns", async () => {
    const seed = seedVault();
    const { packId } = await seed.approve(loadFixture("small-chat"));
    const client = await connect(seed.root);
    const eleven = Array.from({ length: 11 }, (_, i) => `t${String(i + 1).padStart(3, "0")}`);
    const tooMany = await call(client, "get_turns", { packId, turnIds: eleven });
    expect(tooMany.isError).toBe(true);

    const stored = seed.vault.readTranscript(packId);
    expect(stored.ok).toBe(true);
    const turns = stored.ok ? stored.value.turns : [];
    const pick = turns.filter((t) => ["t001", "t003", "t004"].includes(t.id));
    const r = await call(client, "get_turns", { packId, turnIds: ["t001", "t003", "t004"] });
    expect(r.isError).toBeFalsy();
    expect(payload(r)).toBe(pick.map(renderTurn).join("\n\n"));

    const unknown = await call(client, "get_turns", { packId, turnIds: ["t099"] });
    expect(payload(unknown)).toContain("t099: not found");
  });

  it("T11 get_turns matches envelope", async () => {
    const seed = seedVault();
    const { packId, envelope } = await seed.approve(loadFixture("small-chat"));
    const r = await call(await connect(seed.root), "get_turns", { packId, turnIds: ["t008"] });
    const body = payload(r);
    expect(body.startsWith("[t008 · assistant]")).toBe(true);
    expect(envelope).toContain(body);
  });

  it("T11 search_history", async () => {
    const seed = seedVault();
    const { packId } = await seed.approve(loadFixture("small-chat"));
    const attPack = await attachmentPack(seed);
    const client = await connect(seed.root);

    const r = await call(client, "search_history", { packId, query: "storage SQLite stack app team", k: 8 });
    expect(r.isError).toBeFalsy();
    const body = payload(r);
    const heads = [...body.matchAll(/^\d+\. (t\d{3}|a\d{3}#c\d+) · score \d+(\.\d+)?(?: · offset=(\d+))?$/gm)];
    expect(heads.length).toBeGreaterThan(0);
    expect(heads.length).toBeLessThanOrEqual(8);
    expect(body).toMatch(/SQLite/); // snippets carry the text

    expect((await call(client, "search_history", { packId, query: "storage", k: 9 })).isError).toBe(true);

    // An attachment hit gives an offset that get_attachment accepts.
    const hit = payload(await call(client, "search_history", { packId: attPack, query: "pgc700", k: 3 }));
    const m = /^\d+\. (a002#c\d+) · score \S+ · offset=(\d+)$/m.exec(hit);
    expect(m, hit).not.toBeNull();
    const offset = Number(m![2]);
    const range = payload(await call(client, "get_attachment", { packId: attPack, attachmentId: "a002", offset }));
    expect(DOC_TEXT.slice(offset).startsWith(range.replace(TRUNCATED_RE, ""))).toBe(true);
  });

  it("AC-18 response cap", async () => {
    const seed = seedVault();
    const { packId } = await seed.approve(longTranscript());
    const ids = Array.from({ length: 10 }, (_, i) => `t${String(i + 1).padStart(3, "0")}`);
    const r = await call(await connect(seed.root), "get_turns", { packId, turnIds: ids });
    expect(r.isError).toBeFalsy();
    expect(countTokens(allText(r))).toBeLessThanOrEqual(4000);
    expect(payload(r)).toMatch(TRUNCATED_RE);
  });

  it("AC-18 offset pages concatenate", async () => {
    const seed = seedVault();
    const transcript = longTranscript();
    const { packId } = await seed.approve(transcript);
    const attPack = await attachmentPack(seed);
    const client = await connect(seed.root);

    const ids = transcript.turns.slice(0, 10).map((t) => t.id);
    const turnPages = await allPages((offset) =>
      call(client, "get_turns", { packId, turnIds: ids, ...(offset === undefined ? {} : { offset }) }),
    );
    expect(turnPages.length).toBeGreaterThan(1);
    expect(turnPages.join("")).toBe(transcript.turns.slice(0, 10).map(renderTurn).join("\n\n"));

    const docPages = await allPages((offset) =>
      call(client, "get_attachment", {
        packId: attPack,
        attachmentId: "a002",
        ...(offset === undefined ? {} : { offset }),
      }),
    );
    expect(docPages.length).toBeGreaterThan(1);
    expect(docPages.join("")).toBe(DOC_TEXT);
  });

  it("AC-19 attachments", async () => {
    const seed = seedVault();
    const packId = await attachmentPack(seed);
    const client = await connect(seed.root);

    const img = await call(client, "get_attachment", { packId, attachmentId: "a001" });
    expect(img.isError).toBeFalsy();
    expect(texts(img)[0]).toMatch(NOTICE_RE);
    const image = img.content.find((c) => c.type === "image") as { data: string; mimeType: string } | undefined;
    expect(image?.mimeType).toBe("image/png");
    expect(image?.data).toBe(PNG.toString("base64"));

    const doc = await call(client, "get_attachment", { packId, attachmentId: "a002", offset: 10 });
    expect(doc.isError).toBeFalsy();
    const range = payload(doc);
    expect(range.length).toBeGreaterThan(0);
    expect(DOC_TEXT.slice(10).startsWith(range.replace(TRUNCATED_RE, ""))).toBe(true);

    const listed = await call(client, "get_attachment", { packId, attachmentId: "a003" });
    expect(listed.isError).toBeFalsy();
    expect(listed.content.some((c) => c.type === "image")).toBe(false);
    expect(allText(listed)).toContain(LISTED_REASON);
  });

  it("AC-19 attachment pages", async () => {
    const seed = seedVault();
    const packId = await attachmentPack(seed);
    const client = await connect(seed.root);

    const p2 = await call(client, "get_attachment", { packId, attachmentId: "a002", page: 2 });
    expect(payload(p2)).toBe(PAGES[1]);
    const p1 = await call(client, "get_attachment", { packId, attachmentId: "a002", page: 1 });
    expect(payload(p1)).toBe(PAGES[0]);
    // The last page is long: capped, and offset counts chars into the page.
    const p3 = await allPages((offset) =>
      call(client, "get_attachment", {
        packId,
        attachmentId: "a002",
        page: 3,
        ...(offset === undefined ? {} : { offset }),
      }),
    );
    expect(p3.join("")).toBe(PAGES[2]);

    const out = await call(client, "get_attachment", { packId, attachmentId: "a002", page: 4 });
    expect(out.isError).toBe(true);
    expect(allText(out)).toMatch(/\b3 pages\b/);
  });

  it("AC-22 served audited", async () => {
    const seed = seedVault();
    const { packId } = await seed.approve(loadFixture("small-chat"));
    const attPack = await attachmentPack(seed);
    const client = await connect(seed.root);

    const calls: Array<[string, Record<string, unknown>]> = [
      ["list_packs", {}],
      ["get_pack", { packId }],
      ["search_history", { packId, query: "SQLite storage" }],
      ["get_turns", { packId, turnIds: ["t003"] }],
      ["get_attachment", { packId: attPack, attachmentId: "a002", page: 2 }],
      ["get_attachment", { packId: attPack, attachmentId: "a001" }],
      ["get_pack", { packId: "cp_deadbeef" }], // error path is audited too
    ];
    // Strings from the pack content that must never reach the audit log.
    const content = ["SQLite", "task-tracker", "pga1", "mockup.png", "notes.txt", "brief.docx"];
    for (const [tool, args] of calls) {
      const before = auditLines(seed.root).length;
      await call(client, tool, args);
      const added = auditLines(seed.root).slice(before);
      expect(added.length, tool).toBe(1);
      const line = added[0]!;
      expect(line.event).toBe("served");
      expect(line.tool).toBe(tool);
      if (typeof args.packId === "string" && args.packId !== "cp_deadbeef") expect(line.packId).toBe(args.packId);
      for (const key of Object.keys(line)) expect(["ts", "event", "tool", "packId", "counts"]).toContain(key);
      const raw = JSON.stringify(line);
      for (const s of content) expect(raw).not.toContain(s);
    }
  });

  it("S9 tool surface", async () => {
    const client = await connect(seedVault().root);
    const { tools } = await client.listTools();
    const forbidden =
      /\b(writ\w*|delet\w*|remov\w*|updat\w*|creat\w*|modif\w*|edit\w*|send\w*|upload\w*|post\w*|sav\w*|network\w*|internet|https?|url\w*|web\w*|download\w*|onlin\w*)\b/i;
    for (const t of tools) {
      const surface = [t.name.replace(/_/g, " "), t.title ?? "", t.description ?? ""].join("\n");
      expect(surface, t.name).not.toMatch(forbidden);
      // Descriptions are triggers: they say what the tool returns and when to use it.
      expect(t.description ?? "", t.name).toMatch(/\breturns?\b/i);
      expect(t.description ?? "", t.name).toMatch(/\buse (it )?when\b/i);
    }
  });
});
