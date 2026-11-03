// T08 fixes found in the manual run: verbatim envelopes render code once, and recent turns in
// conversation order (compiler.md §Verbatim mode, §Envelope).
import { describe, expect, it } from "vitest";
import { compile } from "../src/compile.js";
import { destination, input } from "./helpers.js";

async function verbatim(budget: number): Promise<{ envelope: string; pack: import("@cb/schema").ContextPack }> {
  const r = await compile(input({ destination: destination(budget) }));
  if (!r.ok) throw new Error(`compile failed: ${JSON.stringify(r.error)}`);
  return r;
}

/** Fenced code blocks in `text`: opening fence (3+ backticks, optional info) to matching close. */
function codeBlocks(text: string): string[] {
  const out: string[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const open = /^(`{3,})\S*$/.exec(lines[i]!);
    if (!open) continue;
    const ticks = open[1]!;
    const end = lines.findIndex((l, j) => j > i && l === ticks);
    if (end < 0) break;
    out.push(lines.slice(i, end + 1).join("\n"));
    i = end;
  }
  return out;
}

describe("verbatim envelope", () => {
  it("T08 verbatim envelope renders no code block twice", async () => {
    const { envelope, pack } = await verbatim(100_000);
    expect(pack.push.artifacts.some((a) => a.kind === "code")).toBe(true); // kept for hashing
    expect(envelope).not.toContain("## Artifacts");
    const blocks = codeBlocks(envelope);
    expect(blocks.length).toBeGreaterThan(0);
    expect(new Set(blocks).size).toBe(blocks.length);
    for (const a of pack.push.artifacts) {
      if (a.kind === "code") expect(envelope.split(a.content).length - 1, a.turnId).toBe(1);
    }
  });

  it("T08 recent turns are chosen newest first and rendered oldest first", async () => {
    const all = await verbatim(100_000);
    const budget = Math.floor(all.pack.stats.pushedTokens / 2);
    const { envelope, pack } = await verbatim(budget);
    const chosen = pack.push.recentTurns.map((t) => t.id);
    expect(chosen.length).toBeGreaterThan(1);
    expect(chosen).toEqual([...chosen].sort().reverse()); // choice order: newest first
    const rendered = [...envelope.matchAll(/^\[(t\d{3}) · (?:user|assistant)\]$/gm)].map((m) => m[1]);
    expect(rendered).toEqual([...chosen].sort()); // display order: conversation order
  });
});
