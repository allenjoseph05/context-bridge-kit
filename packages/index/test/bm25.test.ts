import { describe, expect, it } from "vitest";
import { buildIndex, docsFromTranscript, search, tokenize } from "../src/index.js";
import type { IndexDoc } from "../src/index.js";
import { loadFixture } from "./helpers.js";

const LONG = loadFixture("long-chat");
const longDocs = (): ReturnType<typeof docsFromTranscript> => docsFromTranscript(LONG, new Map());

const filler = (n: number, seed: string): string =>
  Array.from({ length: n }, (_, i) => `${seed} sentence number ${i} about ordinary things.`).join(" ");

describe("bm25", () => {
  it("T10 finds the right turn", () => {
    const index = buildIndex(longDocs());
    const hits = search(index, "configStep30", 5);
    expect(hits[0]?.ref).toBe("t030");
  });

  it("T10 deterministic", () => {
    const queries = ["configStep30", "retries default", "job runner logging", "30"];
    const a = buildIndex(longDocs());
    const b = buildIndex(longDocs());
    for (const q of queries) {
      const first = search(a, q, 8);
      expect(search(a, q, 8)).toEqual(first);
      expect(search(b, q, 8)).toEqual(first);
    }

    // Identical documents score the same; ties are ordered by ref, not insertion order.
    const tied: IndexDoc[] = [
      { ref: "t003", text: "alpha beta" },
      { ref: "t001", text: "alpha beta" },
      { ref: "t002", text: "gamma delta" },
      { ref: "a001#c1", text: "alpha beta" },
    ];
    const hits = search(buildIndex(tied), "alpha", 8);
    expect(hits.map((h) => h.ref)).toEqual(["a001#c1", "t001", "t003"]);
    expect(new Set(hits.map((h) => h.score)).size).toBe(1);
  });

  it("T10 snippets", () => {
    const docs: IndexDoc[] = [
      { ref: "t001", text: `${filler(40, "Opening")} The needleWidget lives here. ${filler(40, "Closing")}` },
      { ref: "t002", text: `${filler(60, "Other")} needle_widget at the very end` },
      { ref: "t003", text: "A short turn that mentions the needle once." },
      { ref: "t004", text: filler(30, "Unrelated") },
    ];
    expect(docs[0]!.text.length).toBeGreaterThan(2000);
    const queries = ["needle", "needleWidget", "widget end", "unrelated ordinary"];
    const index = buildIndex([...docs, ...longDocs()]);
    for (const q of [...queries, "configStep30", "metrics default"]) {
      const hits = search(index, q, 8);
      expect(hits.length).toBeGreaterThan(0);
      const queryTerms = new Set(tokenize(q));
      for (const hit of hits) {
        expect(hit.snippet.length).toBeLessThanOrEqual(600);
        expect(tokenize(hit.snippet).some((t) => queryTerms.has(t))).toBe(true);
      }
    }
  });

  it("T10 serialisable", () => {
    const extracted = new Map([
      ["a001", `${filler(200, "Manual")}\n\nThe frobnicator uses port 8443.\n\n${filler(200, "Appendix")}`],
    ]);
    const docs = docsFromTranscript(LONG, extracted);
    const index = buildIndex(docs);
    const revived = JSON.parse(JSON.stringify(index)) as typeof index;
    for (const q of ["configStep30", "frobnicator 8443", "manual appendix", "constructor __proto__"]) {
      expect(search(revived, q, 8)).toEqual(search(index, q, 8));
    }
  });

  it("T10 k cap", () => {
    const docs: IndexDoc[] = Array.from({ length: 20 }, (_, i) => ({
      ref: `t${String(i + 1).padStart(3, "0")}`,
      text: `alpha item ${i}`,
    }));
    const index = buildIndex(docs);
    expect(search(index, "alpha", 50)).toHaveLength(8);
    expect(search(index, "alpha", 8)).toHaveLength(8);
    expect(search(index, "alpha", 3)).toHaveLength(3);
  });
});
