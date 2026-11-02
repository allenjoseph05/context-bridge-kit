// T02 acceptance tests for the paste parser. Synthetic text only.
import { describe, expect, it } from "vitest";
import { CaptureError, Transcript } from "@cb/schema";
import { parsePaste } from "../src/paste.js";

async function parseOk(text: string, opts?: { title?: string }): Promise<Transcript> {
  const result = await parsePaste(text, opts);
  if ("code" in result) throw new Error(`expected a transcript, got ${result.code}`);
  // Every success must be a valid Transcript.
  return Transcript.parse(result);
}

describe("parsePaste", () => {
  it("AC-03 role markers split turns", async () => {
    const t = await parseOk(
      [
        "User: How should I store tasks?",
        "Assistant: Start with a local file.",
        "It is simple.",
        "User: And later?",
        "Assistant: Move to a database.",
      ].join("\n"),
      { title: "Planning" },
    );
    expect(t.turns.map((x) => x.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(t.turns.map((x) => x.id)).toEqual(["t001", "t002", "t003", "t004"]);
    expect(t.turns[0]?.parts).toEqual([{ kind: "text", text: "How should I store tasks?" }]);
    expect(t.turns[1]?.parts).toEqual([
      { kind: "text", text: "Start with a local file.\nIt is simple." },
    ]);
    expect(t.source).toMatchObject({
      adapter: "paste@0.1",
      confidence: "inferred",
      assistant: "unknown",
      title: "Planning",
    });
    expect(t.warnings).toEqual([]);
    // Text that merely contains a marker word mid-line or after indentation does not split.
    const t2 = await parseOk("User: I asked the assistant: why?\nNote: User: is a marker here");
    expect(t2.turns).toHaveLength(1);
  });

  it("AC-03 marker synonyms", async () => {
    const t = await parseOk(
      [
        "you: one",
        "ChatGPT: two",
        "Me: three",
        "GEMINI: four",
        "USER: five",
        "Claude: six",
        "you: seven",
        "Model: eight",
        "me: nine",
        "ai: ten",
        "User: eleven",
        "assistant: twelve",
      ].join("\n"),
    );
    expect(t.turns.map((x) => x.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    // Several different products named → assistant unknown.
    expect(t.source.assistant).toBe("unknown");

    expect((await parseOk("You: hi\nChatGPT: hello")).source.assistant).toBe("chatgpt");
    expect((await parseOk("You: hi\nGEMINI: hello")).source.assistant).toBe("gemini");
    expect((await parseOk("You: hi\nclaude: hello\nAssistant: more")).source.assistant).toBe(
      "claude",
    );
    expect((await parseOk("You: hi\nModel: hello")).source.assistant).toBe("unknown");
  });

  it("AC-03 fenced code preserved", async () => {
    const code = "def add(a, b):\n    return a + b\n\n\tprint(add(1, 2))  # tab and trailing  ";
    const t = await parseOk(
      ["User: Write add.", "Assistant: Here it is:", "```python", code, "```", "User: Thanks"].join(
        "\n",
      ),
    );
    expect(t.turns).toHaveLength(3);
    expect(t.turns[1]?.parts).toEqual([
      { kind: "text", text: "Here it is:" },
      { kind: "code", lang: "python", content: code },
    ]);
    // A marker inside a fence does not split, and a fence without a language has no lang.
    const t2 = await parseOk("Assistant: log:\n```\nUser: not a turn\nAI: nor this\n```\ndone");
    expect(t2.turns).toHaveLength(1);
    expect(t2.turns[0]?.parts).toEqual([
      { kind: "text", text: "log:" },
      { kind: "code", content: "User: not a turn\nAI: nor this" },
      { kind: "text", text: "done" },
    ]);
  });

  it("AC-03 tables preserved", async () => {
    const table = [
      "| Option | Cost |",
      "| --- | ---: |",
      "| SQLite | 0 |",
      "| Postgres | 5 |",
    ].join("\n");
    const t = await parseOk(["User: Compare.", "Assistant: Here:", table, "Pick one."].join("\n"));
    expect(t.turns[1]?.parts).toEqual([
      { kind: "text", text: "Here:" },
      { kind: "table", markdown: table },
      { kind: "text", text: "Pick one." },
    ]);
  });

  it("AC-03 no markers", async () => {
    const text = "Just some notes\nwithout any roles.";
    const t = await parseOk(text);
    expect(t.turns).toHaveLength(1);
    expect(t.turns[0]?.role).toBe("user");
    expect(t.turns[0]?.parts).toEqual([{ kind: "text", text }]);
    expect(t.warnings).toContain("no roles found");

    // Preamble before the first marker is kept as a leading user turn, with a warning.
    const p = await parseOk("Context first.\nUser: question\nAssistant: answer");
    expect(p.turns.map((x) => x.role)).toEqual(["user", "user", "assistant"]);
    expect(p.turns[0]?.parts).toEqual([{ kind: "text", text: "Context first." }]);
    expect(p.warnings.some((w) => w.includes("before the first role marker"))).toBe(true);

    // Empty turns are skipped and counted; consecutive same-role turns stay separate.
    const e = await parseOk("User:\nUser: real\nUser: again\nAssistant:   \nAssistant: ok");
    expect(e.turns.map((x) => x.role)).toEqual(["user", "user", "assistant"]);
    expect(e.warnings).toContain("2 empty turns skipped");
  });

  it("AC-04 empty paste is an error", async () => {
    for (const text of ["", "   ", "\n\t \r\n"]) {
      const result = await parsePaste(text);
      expect(CaptureError.parse(result).code).toBe("capture_empty");
    }
    // Only markers with empty bodies is also empty: never an empty transcript.
    const result = await parsePaste("User:\nAssistant:");
    expect(CaptureError.parse(result).code).toBe("capture_empty");
  });

  it("T02 turn hashes are sha256 of canonical parts", async () => {
    const { canonicalJson } = await import("@cb/schema");
    const { sha256Hex } = await import("@cb/schema/node");
    const t = await parseOk("User: a\nAssistant: b");
    for (const turn of t.turns) expect(turn.sha256).toBe(sha256Hex(canonicalJson(turn.parts)));
  });
});
