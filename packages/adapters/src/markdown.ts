// Markdown helpers shared by the paste parser and (later) the DOM adapters.
// Code and tables are copied character for character, never rewritten.
import type { Part } from "@cb/schema";

/** An open fenced code block: the fence characters and the info-string language, if any. */
export interface Fence {
  marker: string;
  lang?: string;
}

const FENCE_OPEN = /^ {0,3}(`{3,})[ \t]*([^`\s]*)[^`]*$/;
const TABLE_DELIMITER = /^ {0,3}\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/;

/** If `line` opens a fenced code block (```` ``` ````, optionally with a language), return it. */
export function fenceOpen(line: string): Fence | undefined {
  const m = FENCE_OPEN.exec(line);
  if (!m?.[1]) return undefined;
  return m[2] ? { marker: m[1], lang: m[2] } : { marker: m[1] };
}

/** True if `line` closes `fence`: same character, at least as long, nothing else on the line. */
export function fenceCloses(line: string, fence: Fence): boolean {
  const m = /^ {0,3}(`{3,})[ \t]*$/.exec(line);
  return m?.[1] !== undefined && m[1].length >= fence.marker.length;
}

/** True if `lines[i]` starts a Markdown table: a row with `|` followed by a delimiter row. */
export function isTableStart(lines: readonly string[], i: number): boolean {
  const header = lines[i];
  const delimiter = lines[i + 1];
  return (
    header !== undefined &&
    delimiter !== undefined &&
    header.includes("|") &&
    header.trim() !== "" &&
    TABLE_DELIMITER.test(delimiter) &&
    delimiter.includes("|")
  );
}

/**
 * Split a Markdown body into `text`, `code` and `table` parts, in order.
 * Code content is the exact text between the fences; an unclosed fence runs to the end.
 * Table markdown is the exact table lines. Text parts are trimmed; blank text is dropped.
 * Line endings are expected as `\n`.
 */
export function splitMarkdown(body: string): Part[] {
  const lines = body.split("\n");
  const parts: Part[] = [];
  let text: string[] = [];

  const flushText = (): void => {
    const joined = text.join("\n").trim();
    if (joined !== "") parts.push({ kind: "text", text: joined });
    text = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const fence = fenceOpen(line);
    if (fence) {
      flushText();
      const code: string[] = [];
      i++;
      while (i < lines.length && !fenceCloses(lines[i] ?? "", fence)) {
        code.push(lines[i] ?? "");
        i++;
      }
      i++; // skip the closing fence (or step past the end)
      const content = code.join("\n");
      parts.push(
        fence.lang ? { kind: "code", lang: fence.lang, content } : { kind: "code", content },
      );
      continue;
    }
    if (isTableStart(lines, i)) {
      flushText();
      const rows: string[] = [];
      while (i < lines.length) {
        const row = lines[i] ?? "";
        if (row.trim() === "" || !row.includes("|")) break;
        rows.push(row);
        i++;
      }
      parts.push({ kind: "table", markdown: rows.join("\n") });
      continue;
    }
    text.push(line);
    i++;
  }
  flushText();
  return parts;
}
