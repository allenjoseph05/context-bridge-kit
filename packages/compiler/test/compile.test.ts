// T05 acceptance tests: verbatim compile, budget, coverage, manifest, artifacts.
import { ContextPack } from "@cb/schema";
import type { Part, Transcript } from "@cb/schema";
import { sha256Hex } from "@cb/schema/node";
import { countTokens } from "@cb/tokens";
import { describe, expect, it } from "vitest";
import { compile, NotImplementedError } from "../src/compile.js";
import type { CompileInput } from "../src/compile.js";
import { checkCoverage } from "../src/coverage.js";
import { renderEnvelope } from "../src/envelope.js";
import {
  ALL_IDS,
  destination,
  expandTurnRef,
  FENCE,
  input,
  LONG,
  loadFixture,
  manifestByTurn,
  turnNo,
} from "./helpers.js";

/** Compile and require success; returns pack and envelope. */
async function ok(
  over: Partial<CompileInput> = {},
): Promise<{ pack: ContextPack; envelope: string }> {
  const result = await compile(input(over));
  if (!result.ok) throw new Error(`compile failed: ${JSON.stringify(result.error)}`);
  return { pack: result.pack, envelope: result.envelope };
}

function artifactContent(part: Part): string | undefined {
  switch (part.kind) {
    case "code":
      return part.content;
    case "table":
      return part.markdown;
    case "math":
      return part.latex;
    default:
      return undefined;
  }
}

/** Synthetic transcript with attachments of every status. */
const WITH_ATTACHMENTS: Transcript = {
  ...loadFixture("small-chat"),
  attachments: [
    {
      id: "a001",
      turnId: "t001",
      origin: "user_upload",
      name: "plan.pdf",
      mime: "application/pdf",
      status: "extracted",
      flags: [],
    },
    {
      id: "a002",
      turnId: "t003",
      origin: "user_upload",
      name: "sketch.png",
      mime: "image/png",
      status: "carried",
      flags: [],
    },
    {
      id: "a003",
      turnId: "t004",
      origin: "generated",
      name: "chart.png",
      mime: "image/png",
      status: "listed",
      reason: "not exposed by the page",
      flags: [],
    },
    {
      id: "a004",
      turnId: "t008",
      origin: "project",
      name: "notes.docx",
      mime: "application/msword",
      status: "unavailable",
      reason: "download failed",
      flags: [],
    },
  ],
};

describe("compile (verbatim)", () => {
  it("AC-08 never over budget", async () => {
    for (const budget of [500, 2000, 20000]) {
      const { pack, envelope } = await ok({ destination: destination(budget) });
      const tokens = countTokens(envelope);
      expect(tokens).toBeLessThanOrEqual(budget);
      expect(pack.stats.pushedTokens).toBe(tokens);
      expect(pack.stats.budget).toBe(budget);
      expect(envelope).toBe(renderEnvelope(pack, { fence: FENCE }));
      expect(ContextPack.safeParse(pack).success).toBe(true);
    }
    // Small budgets push fewer turns than large ones.
    const small = await ok({ destination: destination(500) });
    const large = await ok({ destination: destination(20000) });
    expect(small.pack.push.recentTurns.length).toBeLessThan(large.pack.push.recentTurns.length);
  });

  it("AC-09 coverage invariant", async () => {
    const half = ALL_IDS.filter((_, i) => i % 2 === 0);
    const cases: Array<Partial<CompileInput>> = [
      ...[500, 2000, 20000].map((b) => ({ destination: destination(b) })),
      { selection: [] },
      { selection: half, destination: destination(20000) },
      { selection: ALL_IDS.slice(10, 30), excluded: ["t015"], destination: destination(1000) },
      { profile: "second_opinion", blind: true, destination: destination(20000) },
      { transcript: loadFixture("small-chat") },
      { transcript: loadFixture("injection-chat") },
      { transcript: WITH_ATTACHMENTS },
      { transcript: WITH_ATTACHMENTS, selection: ["t001", "t002"] },
    ];
    for (const c of cases) {
      const { pack } = await ok(c);
      const transcript = c.transcript ?? LONG;
      expect(checkCoverage(transcript, pack)).toEqual([]);
      expect(ContextPack.safeParse(pack).success).toBe(true);
    }

    // checkCoverage is not trivially empty: dropping entries is reported.
    const { pack } = await ok({ transcript: WITH_ATTACHMENTS, selection: ["t008"] });
    const broken: ContextPack = {
      ...pack,
      push: {
        ...pack.push,
        manifest: pack.push.manifest.filter((e) => e.ref !== "a003" && !e.ref.startsWith("t001")),
      },
    };
    const missing = checkCoverage(WITH_ATTACHMENTS, broken);
    expect(missing).toContain("a003");
    expect(missing).toContain("t001");
  });

  it("AC-09 manifest ranges and reasons", async () => {
    // Unselected t001–t020 collapse into one range entry.
    const last40 = await ok({ selection: ALL_IDS.slice(20), destination: destination(20000) });
    const head = last40.pack.push.manifest.find((e) => e.ref.startsWith("t001"));
    expect(head).toMatchObject({ ref: "t001-t020", why: "excluded_by_user" });

    // A gap in the selection becomes its own range.
    const gap = await ok({
      selection: [...ALL_IDS.slice(0, 10), ...ALL_IDS.slice(40)],
      destination: destination(20000),
    });
    expect(gap.pack.push.manifest).toContainEqual(
      expect.objectContaining({ ref: "t011-t040", why: "excluded_by_user" }),
    );

    // Budget cuts are reasoned "budget"; excluded turns "excluded_by_user".
    const cut = await ok({ excluded: ["t060"], destination: destination(600) });
    const byTurn = manifestByTurn(cut.pack);
    expect(byTurn.get("t060")?.why).toBe("excluded_by_user");
    expect(cut.pack.push.recentTurns.map((t) => t.id)).not.toContain("t060");
    expect(byTurn.get("t001")?.why).toBe("budget");

    // General rule, on several packs: consecutive turns with the same why share one entry,
    // and a single turn is written as its id, not as a range.
    for (const { pack } of [last40, gap, cut]) {
      const entries = pack.push.manifest.filter((e) => expandTurnRef(e.ref).length > 0);
      for (const e of entries) {
        const ids = expandTurnRef(e.ref);
        if (ids.length === 1) expect(e.ref).toBe(ids[0]);
      }
      const sorted = [...entries].sort(
        (a, b) => turnNo(expandTurnRef(a.ref)[0] ?? "") - turnNo(expandTurnRef(b.ref)[0] ?? ""),
      );
      for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1];
        const next = sorted[i];
        if (prev === undefined || next === undefined) continue;
        const prevLast = turnNo(expandTurnRef(prev.ref).at(-1) ?? "");
        const nextFirst = turnNo(expandTurnRef(next.ref)[0] ?? "");
        if (nextFirst === prevLast + 1) expect(next.why).not.toBe(prev.why);
      }
    }
  });

  it("AC-10 artifacts byte-identical and whole", async () => {
    const source = new Map(LONG.turns.map((t) => [t.id, t]));
    for (const budget of [500, 800, 1200, 2000, 4000, 20000]) {
      const { pack } = await ok({ destination: destination(budget) });
      // Every pushed turn is the source turn, whole.
      for (const turn of pack.push.recentTurns) expect(turn).toEqual(source.get(turn.id));

      // Artifacts are exactly the code/table/math parts of pushed turns, copied byte for byte.
      const expected = pack.push.recentTurns.flatMap((turn) =>
        turn.parts.flatMap((part, partIndex) => {
          const content = artifactContent(part);
          return content === undefined ? [] : [{ turnId: turn.id, partIndex, content }];
        }),
      );
      expect(
        pack.push.artifacts.map(({ turnId, partIndex, content }) => ({
          turnId,
          partIndex,
          content,
        })),
      ).toEqual(expect.arrayContaining(expected));
      expect(pack.push.artifacts).toHaveLength(expected.length);
      for (const a of pack.push.artifacts) {
        const part = source.get(a.turnId)?.parts[a.partIndex];
        expect(part?.kind).toBe(a.kind);
        expect(a.content).toBe(part === undefined ? undefined : artifactContent(part));
        expect(a.sha256).toBe(sha256Hex(a.content));
        if (part?.kind === "code") expect(a.lang).toBe(part.lang);
      }
    }
    // The fixture's code turns are pushed at a large budget.
    const { pack } = await ok({ destination: destination(20000) });
    expect(pack.push.artifacts.map((a) => a.turnId)).toEqual(
      expect.arrayContaining(["t010", "t030", "t055"]),
    );
  });

  it("T05 recency order", async () => {
    const selection = ALL_IDS.filter((_, i) => i % 3 === 0);
    const { pack } = await ok({ selection, destination: destination(600) });
    const pushed = pack.push.recentTurns.map((t) => t.id);
    expect(pushed.length).toBeGreaterThan(0);
    expect(pushed.length).toBeLessThan(selection.length);
    expect(pushed).toEqual(selection.slice(-pushed.length).reverse());
    const byTurn = manifestByTurn(pack);
    for (const id of selection.slice(0, -pushed.length)) expect(byTurn.get(id)?.why).toBe("budget");
    expect(pack.stats.cutCount).toBe(selection.length - pushed.length);
  });

  it("T05 condensed not yet", async () => {
    const run = compile(input({ mode: "condensed" }));
    await expect(run).rejects.toBeInstanceOf(NotImplementedError);
    await expect(compile(input({ mode: "condensed" }))).rejects.toThrow(/T19/);
  });

  it("T05 forced turns dropped last, never silently", async () => {
    // A forced old turn survives cuts that remove newer unforced turns.
    const forced = await ok({ forcedPush: ["t001"], destination: destination(600) });
    const pushed = forced.pack.push.recentTurns.map((t) => t.id);
    expect(pushed).toContain("t001");
    expect(pushed).not.toContain("t002");
    expect(pushed.at(-1)).toBe("t001"); // still newest first
    expect(forced.pack.notices).toEqual([]);

    // A forced turn that cannot fit goes to the manifest as "budget", with a notice.
    const base = await ok({ selection: [], destination: destination(20000) });
    const budget = base.pack.stats.pushedTokens + 40;
    const tight = await ok({
      selection: ["t010"],
      forcedPush: ["t010"],
      destination: destination(budget),
    });
    expect(tight.pack.push.recentTurns).toEqual([]);
    expect(manifestByTurn(tight.pack).get("t010")?.why).toBe("budget");
    expect(tight.pack.notices).toHaveLength(1);
    expect(tight.envelope).toContain(tight.pack.notices[0]);
    expect(countTokens(tight.envelope)).toBeLessThanOrEqual(budget);
  });

  it("T05 over budget returns typed error", async () => {
    const result = await compile(input({ destination: destination(50) }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("over_budget");
    expect(result.error.budget).toBe(50);
    expect(result.error.needed).toBeGreaterThan(50);
  });

  it("AC-13 blind second opinion in verbatim mode withholds the answer", async () => {
    const { pack, envelope } = await ok({
      profile: "second_opinion",
      blind: true,
      destination: destination(20000, "clipboard", "second_opinion"),
    });
    expect(pack.blind).toBe(true);
    expect(pack.push.recentTurns.length).toBeGreaterThan(0);
    expect(pack.push.recentTurns.every((t) => t.role === "user")).toBe(true);
    expect(envelope).not.toMatch(/ · assistant\]/);
    for (const t of LONG.turns.filter((x) => x.role === "assistant")) {
      for (const p of t.parts) if (p.kind === "text") expect(envelope).not.toContain(p.text);
    }
    const byTurn = manifestByTurn(pack);
    for (const t of LONG.turns.filter((x) => x.role === "assistant")) {
      expect(byTurn.get(t.id)?.why).toBe("profile");
    }
    expect(pack.push.manifest.some((e) => /withheld on purpose/i.test(e.what))).toBe(true);
    expect(checkCoverage(LONG, pack)).toEqual([]);
  });
});
