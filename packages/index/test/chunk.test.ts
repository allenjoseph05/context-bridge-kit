import { countTokens } from "@cb/tokens";
import { describe, expect, it } from "vitest";
import { buildIndex, chunkText, docsFromTranscript, search } from "../src/index.js";
import { loadFixture } from "./helpers.js";

const para = (i: number, sentences: number): string =>
  Array.from({ length: sentences }, (_, j) => `Paragraph ${i} sentence ${j} talks about item ${i * 100 + j}.`).join(
    " ",
  );

const words = (s: string): string[] => s.split(/\s+/).filter(Boolean);

describe("chunkText and docsFromTranscript", () => {
  it("T10 chunks fit maxTokens and split on paragraphs, then sentences", () => {
    const text = [para(1, 3), para(2, 3), para(3, 80), para(4, 3)].join("\n\n");
    const chunks = chunkText(text, 120);
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(countTokens(c)).toBeLessThanOrEqual(120);
    // Small paragraphs are kept whole; the long one is split at sentence ends.
    expect(chunks[0]).toContain(para(1, 3));
    expect(chunks[0]).toContain(para(2, 3));
    for (const c of chunks.filter((c) => c.includes("Paragraph 3"))) expect(c.trimEnd()).toMatch(/\.$/);
    // Nothing is lost.
    expect(chunks.flatMap(words)).toEqual(words(text));
    expect(chunkText("")).toEqual([]);
    expect(chunkText("short text")).toEqual(["short text"]);
  });

  it("T10 text without sentence breaks is still chunked", () => {
    const text = Array.from({ length: 3000 }, (_, i) => `w${i}`).join(" ");
    const chunks = chunkText(text, 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(countTokens(c)).toBeLessThanOrEqual(200);
    expect(chunks.flatMap(words)).toEqual(words(text));
  });

  it("T10 refs and offsets from a transcript", () => {
    const long = loadFixture("long-chat");
    const doc = [para(1, 60), "The frobnicator uses port 8443.", para(2, 60)].join("\n\n");
    const docs = docsFromTranscript(long, new Map([["a002", doc]]));

    const turns = docs.filter((d) => d.ref.startsWith("t"));
    expect(turns.map((d) => d.ref)).toEqual(long.turns.map((t) => t.id));
    expect(turns.every((d) => d.offset === undefined)).toBe(true);
    expect(turns.find((d) => d.ref === "t030")?.text).toContain("configStep30");

    const chunks = docs.filter((d) => d.ref.startsWith("a002#"));
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => {
      expect(c.ref).toBe(`a002#c${i + 1}`);
      expect(c.offset).toBeTypeOf("number");
      expect(doc.slice(c.offset, c.offset! + c.text.length)).toBe(c.text);
    });

    const index = buildIndex(docs);
    const [hit] = search(index, "frobnicator", 8);
    const chunk = chunks.find((c) => c.text.includes("frobnicator"))!;
    expect(hit).toMatchObject({ ref: chunk.ref, offset: chunk.offset });
    expect(search(index, "configStep30", 1)[0]).not.toHaveProperty("offset");
  });
});
