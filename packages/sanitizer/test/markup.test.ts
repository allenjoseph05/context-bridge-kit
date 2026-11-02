// T03 row 3: markup remnants (sanitizer.md §Steps 2). Synthetic text only.
import { describe, expect, it } from "vitest";
import { canonicalJson, type Transcript } from "@cb/schema";
import { sha256Hex } from "@cb/schema/node";
import { createContext, sanitizeText, sanitizeTranscript } from "../src/index.js";

const WITH_MARKUP =
  'Before<script type="text/javascript">steal()</script> middle <STYLE>p { color: red }</STYLE>' +
  "after<!-- hidden\nmulti-line comment -->end. Keep <b>bold</b> and a < b.";
const CLEANED = "Before middle afterend. Keep <b>bold</b> and a < b.";

describe("markup remnants", () => {
  it("AC-05 markup remnants", async () => {
    // Text: script, style and comments go (any case, any attributes, across lines); other tags stay.
    expect(sanitizeText(WITH_MARKUP, createContext()).text).toBe(CLEANED);
    // Code: untouched.
    expect(sanitizeText(WITH_MARKUP, createContext(), { isCode: true }).text).toBe(WITH_MARKUP);

    // In a transcript: text and table parts cleaned; code and tool_output parts keep their markup
    // (tool_output may be code or HTML output) but still get secrets redacted.
    const key = "AKIAZZZZEXAMPLE12345";
    const parts: Transcript["turns"][number]["parts"] = [
      { kind: "text", text: WITH_MARKUP },
      { kind: "code", lang: "html", content: WITH_MARKUP },
      { kind: "table", markdown: `| a |\n| --- |\n| x<!-- c -->y |` },
      { kind: "tool_output", tool: "curl", content: `${WITH_MARKUP}\n${key}` },
    ];
    const t: Transcript = {
      schema: "transcript/0.2",
      source: { assistant: "test", adapter: "test@0", confidence: "structured" },
      capturedAt: "2026-11-02T10:00:00.000Z",
      turns: [{ id: "t001", role: "assistant", parts, sha256: sha256Hex(canonicalJson(parts)) }],
      attachments: [],
      extras: {},
      warnings: [],
    };
    const { transcript } = await sanitizeTranscript(t, createContext());
    expect(transcript.turns[0]?.parts).toEqual([
      { kind: "text", text: CLEANED },
      { kind: "code", lang: "html", content: WITH_MARKUP },
      { kind: "table", markdown: "| a |\n| --- |\n| xy |" },
      { kind: "tool_output", tool: "curl", content: `${WITH_MARKUP}\n[SECRET_1]` },
    ]);
  });
});
